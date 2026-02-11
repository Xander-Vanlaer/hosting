# Runbook: Database Migration

**Document Version:** 1.0  
**Last Updated:** 2024-02  
**Estimated Time:** 30-60 minutes  
**Skill Level:** Advanced

## Overview

This runbook provides procedures for executing database schema migrations on the PostgreSQL database in a production environment. It covers planning, execution, verification, and rollback procedures.

---

## Prerequisites

### Required Access
- SSH access to swarm manager node (10.0.1.10)
- PostgreSQL admin credentials
- Database backup/restore permissions
- Access to application repository

### Required Information
- Migration scripts location
- Target schema version
- Downtime window (if required)
- Rollback plan

### Pre-Migration Checklist
- [ ] Migration scripts reviewed and tested
- [ ] Database backup completed
- [ ] Downtime window approved (if required)
- [ ] Rollback scripts prepared
- [ ] Application compatibility verified
- [ ] Team notified of maintenance window
- [ ] Monitoring alerts configured

### Tools Required
```bash
# Verify tools are installed
docker --version
psql --version || sudo apt-get install -y postgresql-client
jq --version || sudo apt-get install -y jq
```

---

## Migration Types

### Type 1: Zero-Downtime Migration
- Non-breaking schema changes
- Backward compatible
- Can run while application is running

### Type 2: Minimal-Downtime Migration  
- Brief application pause during critical phase
- Typically < 5 minutes downtime

### Type 3: Full-Downtime Migration
- Breaking schema changes
- Application must be stopped
- Extended downtime required

---

## Procedure

### Step 1: Pre-Migration Assessment

```bash
# SSH to swarm manager
ssh manager@10.0.1.10

# Set environment variables
export POSTGRES_HOST="postgres"
export POSTGRES_DB="hosting_db"
export POSTGRES_USER="hosting_user"
export PGPASSWORD="your_password"

# Connect to database
docker exec -it $(docker ps -q -f name=hosting_postgres) bash

# Inside postgres container
psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}
```

**Check Database State:**
```sql
-- Check current schema version
SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 5;

-- Check database size
SELECT pg_size_pretty(pg_database_size('hosting_db')) as database_size;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- Check active connections
SELECT 
  pid,
  usename,
  application_name,
  client_addr,
  state,
  query_start,
  state_change
FROM pg_stat_activity
WHERE datname = 'hosting_db';

-- Check for long-running queries
SELECT 
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
  AND state != 'idle';

-- Check for locks
SELECT 
  locktype,
  relation::regclass,
  mode,
  granted,
  pid
FROM pg_locks
WHERE NOT granted;

-- Check disk space
\! df -h /var/lib/postgresql/data
```

**Verification:**
- Note current schema version
- Verify no blocking locks
- Confirm sufficient disk space (at least 30% free)
- Document database size

**Exit psql:**
```sql
\q
```

### Step 2: Create Database Backup

```bash
# Exit postgres container
exit

# Create backup using the backup script
/opt/scripts/backup.sh database

# Or manually create backup
BACKUP_DIR="/mnt/nfs/backups/postgres"
BACKUP_FILE="postgres-pre-migration-$(date +%Y%m%d-%H%M%S).sql"

docker exec $(docker ps -q -f name=hosting_postgres) \
  pg_dump -U ${POSTGRES_USER} -d ${POSTGRES_DB} -F c -b -v \
  > ${BACKUP_DIR}/${BACKUP_FILE}

# Verify backup was created
ls -lh ${BACKUP_DIR}/${BACKUP_FILE}

# Create backup metadata
cat > ${BACKUP_DIR}/${BACKUP_FILE}.meta <<EOF
Backup Date: $(date)
Database: ${POSTGRES_DB}
Size: $(du -h ${BACKUP_DIR}/${BACKUP_FILE} | cut -f1)
Purpose: Pre-migration backup
Migration: [migration description]
EOF

# Test backup integrity
docker exec $(docker ps -q -f name=hosting_postgres) \
  pg_restore --list ${BACKUP_DIR}/${BACKUP_FILE} | head -20

# Copy backup to remote location
rsync -avz ${BACKUP_DIR}/${BACKUP_FILE} backup@10.0.1.20:/mnt/storage/backups/
```

**Verification:**
```bash
# Verify backup file size
BACKUP_SIZE=$(stat -f%z "${BACKUP_DIR}/${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_DIR}/${BACKUP_FILE}")
if [ ${BACKUP_SIZE} -gt 1000 ]; then
  echo "✓ Backup created successfully: $(du -h ${BACKUP_DIR}/${BACKUP_FILE})"
else
  echo "✗ Backup failed or empty"
  exit 1
fi

# Verify remote backup
ssh backup@10.0.1.20 "ls -lh /mnt/storage/backups/${BACKUP_FILE}"
```

### Step 3: Prepare Migration Scripts

```bash
# Clone/update application repository
cd /opt/applications/hosting-app
git fetch --all
git checkout main
git pull

# Navigate to migrations directory
cd migrations

# List available migrations
ls -lah

# Review migration to be applied
export MIGRATION_FILE="20240215_add_user_preferences.sql"
cat ${MIGRATION_FILE}

# Review rollback script
export ROLLBACK_FILE="20240215_add_user_preferences_rollback.sql"
cat ${ROLLBACK_FILE}

# Validate SQL syntax
docker run --rm -i postgres:15-alpine psql --echo-all --set ON_ERROR_STOP=1 < ${MIGRATION_FILE}
```

**Verification:**
- SQL syntax is valid
- Migration has corresponding rollback script
- All dependent migrations already applied
- No destructive operations without confirmation

### Step 4: Create Migration Execution Plan

```bash
# Document migration plan
cat > /tmp/migration-plan-$(date +%Y%m%d).md <<'EOF'
# Migration Execution Plan

## Migration Details
- **Migration ID:** 20240215
- **Description:** Add user preferences table
- **Type:** Zero-Downtime
- **Estimated Duration:** 10 minutes

## Pre-Migration Steps
1. ✓ Database backup completed
2. ✓ Migration scripts reviewed
3. ✓ Rollback scripts prepared
4. ✓ Team notified

## Migration Steps
1. Apply schema changes
2. Verify schema changes
3. Update application configuration
4. Verify application functionality

## Rollback Plan
- Rollback script: 20240215_add_user_preferences_rollback.sql
- Restore from backup if needed

## Success Criteria
- New table exists with correct schema
- Application starts successfully
- No errors in application logs
- Performance metrics normal

## Contacts
- Database Admin: dba@example.com
- Application Owner: dev@example.com
- On-Call: oncall@example.com
EOF

cat /tmp/migration-plan-$(date +%Y%m%d).md
```

### Step 5: Execute Migration (Zero-Downtime)

For non-breaking changes that don't require application downtime:

```bash
# Copy migration file to postgres container
docker cp ${MIGRATION_FILE} \
  $(docker ps -q -f name=hosting_postgres):/tmp/

# Execute migration
docker exec -i $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  --set ON_ERROR_STOP=1 \
  --echo-all \
  -f /tmp/${MIGRATION_FILE}

# Capture exit code
MIGRATION_EXIT_CODE=$?

if [ ${MIGRATION_EXIT_CODE} -ne 0 ]; then
  echo "Migration failed with exit code ${MIGRATION_EXIT_CODE}"
  exit 1
fi

echo "Migration completed successfully"
```

**Verification:**
```bash
# Verify migration was applied
docker exec -it $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'

-- Check schema_migrations table
SELECT * FROM schema_migrations WHERE version = '20240215';

-- Verify new table exists
\d+ user_preferences

-- Check table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'user_preferences'
ORDER BY ordinal_position;

-- Verify indexes
\di user_preferences*

-- Check constraints
SELECT con.conname, con.contype, pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'user_preferences';

\q
EOF
```

### Step 6: Execute Migration (With Downtime)

For breaking changes requiring application downtime:

```bash
# Step 6.1: Enable maintenance mode
cat > /mnt/nfs/nginx/conf.d/maintenance.conf <<'EOF'
server {
    listen 80 default_server;
    server_name _;
    
    root /usr/share/nginx/html;
    
    location / {
        return 503;
    }
    
    error_page 503 @maintenance;
    location @maintenance {
        rewrite ^(.*)$ /maintenance.html break;
    }
}
EOF

# Reload nginx
docker service update --force hosting_nginx

# Verify maintenance mode
curl -I http://localhost/
# Should return 503 Service Unavailable

# Step 6.2: Scale down application to 0
export SERVICE_NAME="hosting_app"
CURRENT_REPLICAS=$(docker service ls --filter "name=${SERVICE_NAME}" --format "{{.Replicas}}" | cut -d'/' -f1)

echo "Current replicas: ${CURRENT_REPLICAS}"
docker service scale ${SERVICE_NAME}=0

# Wait for all containers to stop
while [ $(docker service ps ${SERVICE_NAME} --filter "desired-state=running" -q | wc -l) -gt 0 ]; do
  echo "Waiting for containers to stop..."
  sleep 5
done

echo "Application stopped"

# Step 6.3: Wait for active connections to close
docker exec -it $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'

-- Check for remaining connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'hosting_db';

-- Terminate remaining connections (except current)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'hosting_db' AND pid <> pg_backend_pid();

\q
EOF

# Step 6.4: Execute migration
docker cp ${MIGRATION_FILE} \
  $(docker ps -q -f name=hosting_postgres):/tmp/

docker exec -i $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  --set ON_ERROR_STOP=1 \
  --echo-all \
  -f /tmp/${MIGRATION_FILE}

MIGRATION_EXIT_CODE=$?

if [ ${MIGRATION_EXIT_CODE} -ne 0 ]; then
  echo "Migration failed! Starting rollback..."
  # Execute rollback steps (see Rollback section)
  exit 1
fi

# Step 6.5: Verify migration
docker exec -it $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "\d+ user_preferences"

# Step 6.6: Restore application
docker service scale ${SERVICE_NAME}=${CURRENT_REPLICAS}

# Wait for application to start
sleep 30

# Step 6.7: Disable maintenance mode
rm /mnt/nfs/nginx/conf.d/maintenance.conf
docker service update --force hosting_nginx

# Verify application is accessible
curl -f http://localhost/health
```

**Verification:**
```bash
# Check application is running
docker service ps ${SERVICE_NAME} --filter "desired-state=running"

# Check for errors in logs
docker service logs ${SERVICE_NAME} --since 5m | grep -i error

# Test application endpoints
curl -f http://localhost/health
curl -f http://localhost/api/version
```

### Step 7: Data Migration (If Required)

For migrations that include data transformations:

```bash
# Execute data migration script
cat > /tmp/data-migration.sql <<'EOF'
-- Example: Migrate data from old to new table structure
BEGIN;

-- Set statement timeout for long operations
SET statement_timeout = '30min';

-- Populate new table with transformed data
INSERT INTO user_preferences (user_id, preferences, created_at)
SELECT 
  id,
  jsonb_build_object('theme', theme, 'language', language),
  now()
FROM users
WHERE theme IS NOT NULL OR language IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Verify row count
DO $$
DECLARE
  source_count INTEGER;
  target_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO source_count FROM users WHERE theme IS NOT NULL OR language IS NOT NULL;
  SELECT COUNT(*) INTO target_count FROM user_preferences;
  
  IF target_count < source_count THEN
    RAISE EXCEPTION 'Data migration incomplete: % rows in source, % in target', source_count, target_count;
  END IF;
  
  RAISE NOTICE 'Data migration successful: % rows migrated', target_count;
END $$;

COMMIT;
EOF

# Copy and execute data migration
docker cp /tmp/data-migration.sql \
  $(docker ps -q -f name=hosting_postgres):/tmp/

docker exec -i $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  --set ON_ERROR_STOP=1 \
  -f /tmp/data-migration.sql
```

**Verification:**
```bash
# Verify data migration
docker exec -it $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'

-- Compare row counts
SELECT 
  'users' as table_name,
  COUNT(*) as count 
FROM users 
WHERE theme IS NOT NULL OR language IS NOT NULL
UNION ALL
SELECT 
  'user_preferences' as table_name,
  COUNT(*) as count 
FROM user_preferences;

-- Sample data verification
SELECT * FROM user_preferences LIMIT 5;

\q
EOF
```

### Step 8: Update Schema Version

```bash
# Update schema_migrations table
docker exec -i $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<EOF

-- Insert migration version
INSERT INTO schema_migrations (version, applied_at)
VALUES ('20240215', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

-- Verify
SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 5;

\q
EOF
```

### Step 9: Analyze and Optimize

```bash
# Analyze new tables for query planner
docker exec -i $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'

-- Analyze new table
ANALYZE user_preferences;

-- Verbose analyze for detailed stats
ANALYZE VERBOSE user_preferences;

-- Check table statistics
SELECT 
  schemaname,
  tablename,
  last_analyze,
  last_autoanalyze,
  n_live_tup,
  n_dead_tup
FROM pg_stat_user_tables
WHERE tablename = 'user_preferences';

-- Vacuum if needed
VACUUM ANALYZE user_preferences;

\q
EOF
```

### Step 10: Post-Migration Verification

```bash
# Test application with new schema
# Check health endpoint
curl -f http://localhost/health

# Test new functionality
curl -f http://localhost/api/users/1/preferences

# Check application logs for errors
docker service logs hosting_app --since 10m | grep -i error

# Monitor database performance
docker exec -it $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'

-- Check for slow queries
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE query LIKE '%user_preferences%'
ORDER BY mean_time DESC
LIMIT 10;

-- Check cache hit ratio
SELECT 
  sum(heap_blks_read) as heap_read,
  sum(heap_blks_hit) as heap_hit,
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
FROM pg_statio_user_tables;

\q
EOF

# Monitor metrics
curl -s "http://10.0.1.30:9090/api/v1/query?query=pg_stat_database_tup_fetched{datname='hosting_db'}" | jq
```

**Verification Checklist:**
- [ ] Schema changes applied correctly
- [ ] Data migrated successfully
- [ ] Application starts without errors
- [ ] All endpoints responding
- [ ] No performance degradation
- [ ] Database metrics normal
- [ ] No errors in logs

### Step 11: Monitor Post-Migration

```bash
# Monitor for next 1 hour
for i in {1..12}; do
  echo "=== Check $(date) ==="
  
  # Check application health
  curl -s http://localhost/health | jq
  
  # Check database connections
  docker exec $(docker ps -q -f name=hosting_postgres) \
    psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
    -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'hosting_db';"
  
  # Check for errors
  docker service logs hosting_app --since 5m | grep -i error | wc -l
  
  # Check response times
  curl -w "Response time: %{time_total}s\n" -o /dev/null -s http://localhost/
  
  sleep 300  # Wait 5 minutes
done
```

### Step 12: Document Migration

```bash
# Create migration record
cat >> /var/log/database-migrations.log <<EOF
========================================
Database Migration Completed
========================================
Date: $(date)
Migration ID: 20240215
Description: Add user preferences table
Type: Zero-Downtime
Duration: [X] minutes
Performed By: $(whoami)
Status: SUCCESS

Database Details:
  Name: ${POSTGRES_DB}
  Previous Schema Version: 20240201
  New Schema Version: 20240215

Changes:
  - Added user_preferences table
  - Created indexes on user_id
  - Migrated data from users table

Backup:
  File: ${BACKUP_FILE}
  Size: $(du -h ${BACKUP_DIR}/${BACKUP_FILE} 2>/dev/null | cut -f1)
  Location: /mnt/nfs/backups/postgres/

Verification:
  - Schema validated ✓
  - Data migrated ✓
  - Application tested ✓
  - Performance normal ✓

Notes:
- Migration completed successfully
- No downtime required
- All tests passing

========================================

EOF

# Update documentation
echo "Schema Version: 20240215 ($(date))" >> /docs/database-schema-history.md
```

---

## Rollback Procedure

### Immediate Rollback (During Migration)

```bash
# If migration fails during execution
# PostgreSQL will automatically rollback transaction if using BEGIN/COMMIT

# Verify rollback occurred
docker exec -it $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'

-- Check if migration was applied
SELECT * FROM schema_migrations WHERE version = '20240215';

-- Verify table doesn't exist
\dt user_preferences

\q
EOF
```

### Manual Rollback (After Migration)

```bash
# Execute rollback script
docker cp ${ROLLBACK_FILE} \
  $(docker ps -q -f name=hosting_postgres):/tmp/

docker exec -i $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  --set ON_ERROR_STOP=1 \
  --echo-all \
  -f /tmp/${ROLLBACK_FILE}

# Verify rollback
docker exec -it $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'

-- Verify table removed
\dt user_preferences

-- Remove migration from schema_migrations
DELETE FROM schema_migrations WHERE version = '20240215';

\q
EOF

# Restart application
docker service update --force hosting_app
```

### Restore from Backup (Complete Rollback)

```bash
# Stop application
docker service scale hosting_app=0

# Wait for connections to close
sleep 30

# Restore from backup
docker exec -i $(docker ps -q -f name=hosting_postgres) \
  pg_restore -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  --clean --if-exists \
  /mnt/nfs/backups/postgres/${BACKUP_FILE}

# Verify restore
docker exec -it $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 5;"

# Restart application
docker service scale hosting_app=${CURRENT_REPLICAS}
```

---

## Troubleshooting

### Issue: Migration Script Syntax Error

**Symptoms:**
- Migration fails with SQL syntax error

**Resolution:**
```bash
# Validate SQL before applying
docker run --rm -i postgres:15-alpine \
  psql --echo-all --set ON_ERROR_STOP=1 \
  < ${MIGRATION_FILE}

# Fix syntax errors in migration script
vi ${MIGRATION_FILE}

# Test again
docker run --rm -i postgres:15-alpine \
  psql --echo-all --set ON_ERROR_STOP=1 \
  < ${MIGRATION_FILE}
```

### Issue: Migration Timeout

**Symptoms:**
- Migration takes too long
- Statement timeout error

**Resolution:**
```bash
# Increase statement timeout
docker exec -i $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'

-- Set longer timeout
SET statement_timeout = '1h';

-- Or configure in postgresql.conf
ALTER DATABASE hosting_db SET statement_timeout = '1h';

\q
EOF

# Retry migration
```

### Issue: Blocking Locks

**Symptoms:**
- Migration hangs
- Lock wait timeout

**Resolution:**
```bash
# Identify blocking queries
docker exec -it $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'

-- Find blocking locks
SELECT 
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_statement,
  blocking_activity.query AS blocking_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

\q
EOF

# Terminate blocking query if safe
docker exec -i $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  -c "SELECT pg_terminate_backend(<blocking_pid>);"
```

### Issue: Data Inconsistency After Migration

**Symptoms:**
- Row counts don't match
- Missing or duplicate data

**Resolution:**
```bash
# Rollback migration
docker cp ${ROLLBACK_FILE} \
  $(docker ps -q -f name=hosting_postgres):/tmp/

docker exec -i $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  -f /tmp/${ROLLBACK_FILE}

# Restore from backup if needed
# See "Restore from Backup" section

# Review and fix migration script
# Test in staging environment before re-applying
```

---

## Best Practices

1. **Always Test in Staging First**
   - Test migration on copy of production data
   - Measure execution time
   - Identify potential issues

2. **Use Transactions**
   - Wrap migrations in BEGIN/COMMIT
   - Enable automatic rollback on error

3. **Minimize Downtime**
   - Use backward-compatible changes when possible
   - Add new columns as nullable
   - Drop columns in separate migration

4. **Monitor During Migration**
   - Watch for locks
   - Monitor disk space
   - Check query performance

5. **Document Everything**
   - Migration purpose
   - Rollback procedure
   - Expected impact

---

## Related Runbooks

- [05-backup-procedures.md](./05-backup-procedures.md) - Database backup procedures
- [06-restore-procedures.md](./06-restore-procedures.md) - Database restore procedures
- [02-release-new-version.md](./02-release-new-version.md) - Application deployment

---

## References

- PostgreSQL Documentation: https://www.postgresql.org/docs/
- Schema Migrations Best Practices: https://www.postgresql.org/docs/current/ddl-alter.html
