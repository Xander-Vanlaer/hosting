# Runbook: Restore Procedures

**Document Version:** 1.0  
**Last Updated:** 2024-02  
**Estimated Time:** 45-90 minutes  
**Skill Level:** Advanced

## Overview

This runbook provides comprehensive procedures for restoring the hosting platform from backups, including full system restore, individual component restore, and point-in-time recovery.

---

## Prerequisites

### Required Access
- SSH access to swarm manager node (10.0.1.10)
- SSH access to NFS storage server (10.0.1.20)
- PostgreSQL admin credentials
- Root/sudo access to all nodes

### Required Information
- Backup ID to restore from
- Restore point objective (full or partial)
- Downtime window approval
- Team notification sent

### Pre-Restore Checklist
- [ ] Backup verified and accessible
- [ ] Backup manifest reviewed
- [ ] Restore plan documented
- [ ] Downtime window scheduled
- [ ] Stakeholders notified
- [ ] Current state backed up (before restore)
- [ ] Rollback plan prepared

### Tools Required
```bash
# Verify tools are installed
docker --version
psql --version || sudo apt-get install -y postgresql-client
tar --version
gpg --version || sudo apt-get install -y gnupg
```

---

## Restore Types

### Full System Restore
Complete restoration of entire platform to a specific backup point.
- **Use Case:** Catastrophic failure, corruption
- **Downtime:** 2-4 hours
- **Risk:** High

### Database Restore
Restore PostgreSQL or Redis to a specific backup point.
- **Use Case:** Database corruption, data loss
- **Downtime:** 30-60 minutes
- **Risk:** Medium

### Selective Restore
Restore specific components or configurations.
- **Use Case:** Configuration rollback, specific data recovery
- **Downtime:** 10-30 minutes
- **Risk:** Low

---

## Procedure - Full System Restore

### Step 1: Pre-Restore Verification

```bash
# SSH to swarm manager
ssh manager@10.0.1.10

# List available backups
ls -lht /mnt/nfs/backups/ | head -20

# Or check remote backups
ssh backup@10.0.1.20 "ls -lht /mnt/storage/backups/ | head -20"

# Select backup to restore
export BACKUP_ID="20240215-020000"
export BACKUP_DIR="/mnt/nfs/backups/${BACKUP_ID}"

# Verify backup exists
if [ ! -d "${BACKUP_DIR}" ]; then
  echo "Backup not found locally, retrieving from remote..."
  rsync -avz backup@10.0.1.20:/mnt/storage/backups/${BACKUP_ID}/ ${BACKUP_DIR}/
fi

# Verify backup manifest
cat ${BACKUP_DIR}/MANIFEST.txt

# Verify backup checksums
echo "Verifying backup integrity..."
while IFS='|' read -r file size checksum; do
  if [ -f "${BACKUP_DIR}/${file}" ]; then
    ACTUAL_CHECKSUM=$(sha256sum "${BACKUP_DIR}/${file}" | cut -d' ' -f1)
    if [ "${ACTUAL_CHECKSUM}" = "${checksum}" ]; then
      echo "✓ ${file}"
    else
      echo "✗ ${file} - Checksum mismatch!"
      exit 1
    fi
  fi
done < <(grep -v "^=" ${BACKUP_DIR}/MANIFEST.txt | grep "|")

echo "Backup integrity verified"
```

**Verification:**
```bash
# Confirm backup is complete
ls -R ${BACKUP_DIR}

# Check backup size
du -sh ${BACKUP_DIR}
```

### Step 2: Create Pre-Restore Backup

```bash
# Before restoring, backup current state
export PRE_RESTORE_BACKUP="/mnt/nfs/backups/pre-restore-$(date +%Y%m%d-%H%M%S)"

echo "Creating pre-restore backup..."
/opt/scripts/backup-full.sh

echo "Pre-restore backup created at ${PRE_RESTORE_BACKUP}"
```

**Verification:**
```bash
# Verify pre-restore backup created
ls -lh /mnt/nfs/backups/ | grep pre-restore
```

### Step 3: Enable Maintenance Mode

```bash
# Create maintenance page
cat > /tmp/maintenance.html <<'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>System Maintenance</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 600px;
            margin: 0 auto;
        }
        h1 { color: #e74c3c; }
        p { color: #666; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔧 System Maintenance</h1>
        <p>We're currently performing system maintenance to improve our services.</p>
        <p>We expect to be back online shortly.</p>
        <p>Thank you for your patience.</p>
        <p><small>Started: $(date)</small></p>
    </div>
</body>
</html>
EOF

# Copy to nginx
docker cp /tmp/maintenance.html \
  $(docker ps -q -f name=hosting_nginx | head -1):/usr/share/nginx/html/

# Enable maintenance mode
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
sleep 10
curl -I http://localhost/
# Should return 503
```

### Step 4: Stop All Services

```bash
# List all services
docker service ls

# Stop application services (keep infrastructure)
docker service scale hosting_app=0

# Wait for services to stop
sleep 30

# Verify services stopped
docker service ps hosting_app --filter "desired-state=running"

# Optional: Stop all services for complete restore
# docker stack rm hosting
# sleep 60
```

**Verification:**
```bash
# Verify no application containers running
docker ps -f name=hosting_app

# Check infrastructure services still running
docker service ls | grep -E "postgres|redis|prometheus|grafana"
```

### Step 5: Restore PostgreSQL Database

```bash
# Get PostgreSQL container
POSTGRES_CONTAINER=$(docker ps -q -f name=hosting_postgres)
export POSTGRES_USER="hosting_user"
export POSTGRES_DB="hosting_db"

# Terminate all connections to database
docker exec -i ${POSTGRES_CONTAINER} \
  psql -U ${POSTGRES_USER} -d postgres <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();
EOF

# Drop and recreate database (for clean restore)
docker exec -i ${POSTGRES_CONTAINER} \
  psql -U ${POSTGRES_USER} -d postgres <<EOF
DROP DATABASE IF EXISTS ${POSTGRES_DB};
CREATE DATABASE ${POSTGRES_DB};
GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${POSTGRES_USER};
EOF

# Copy backup file to container
docker cp ${BACKUP_DIR}/postgres/postgres-${BACKUP_ID}.dump \
  ${POSTGRES_CONTAINER}:/tmp/

# Restore from custom format backup
docker exec ${POSTGRES_CONTAINER} \
  pg_restore -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  --clean --if-exists \
  --no-owner --no-privileges \
  --exit-on-error \
  /tmp/postgres-${BACKUP_ID}.dump

RESTORE_EXIT_CODE=$?

if [ ${RESTORE_EXIT_CODE} -ne 0 ]; then
  echo "PostgreSQL restore failed with exit code ${RESTORE_EXIT_CODE}"
  echo "Attempting restore from SQL format..."
  
  # Try SQL format if custom format fails
  docker cp ${BACKUP_DIR}/postgres/postgres-${BACKUP_ID}.sql \
    ${POSTGRES_CONTAINER}:/tmp/
  
  docker exec -i ${POSTGRES_CONTAINER} \
    psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
    -f /tmp/postgres-${BACKUP_ID}.sql
fi

echo "PostgreSQL restore completed"
```

**Verification:**
```bash
# Verify database restored
docker exec -i ${POSTGRES_CONTAINER} \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'

-- Check table count
SELECT count(*) FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check row counts in key tables
SELECT 
  schemaname,
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 10;

-- Verify schema version
SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 5;

\q
EOF

# Check for errors
docker logs $(docker ps -q -f name=hosting_postgres) --tail 50 | grep -i error
```

### Step 6: Restore Redis Data

```bash
# Get Redis container
REDIS_CONTAINER=$(docker ps -q -f name=hosting_redis)

# Stop Redis
docker service scale hosting_redis=0

# Wait for Redis to stop
sleep 10

# Get Redis volume
REDIS_VOLUME=$(docker volume ls --filter "name=redis_data" --format "{{.Name}}")

# Restore RDB file
docker run --rm \
  -v ${REDIS_VOLUME}:/data \
  -v ${BACKUP_DIR}/redis:/backup \
  alpine \
  cp /backup/redis-${BACKUP_ID}.rdb /data/dump.rdb

# Restore AOF file if exists
if [ -f ${BACKUP_DIR}/redis/redis-${BACKUP_ID}.aof ]; then
  docker run --rm \
    -v ${REDIS_VOLUME}:/data \
    -v ${BACKUP_DIR}/redis:/backup \
    alpine \
    cp /backup/redis-${BACKUP_ID}.aof /data/appendonly.aof
fi

# Start Redis
docker service scale hosting_redis=1

# Wait for Redis to start
sleep 20
```

**Verification:**
```bash
# Verify Redis is running
docker service ps hosting_redis --filter "desired-state=running"

# Test Redis connectivity
docker exec $(docker ps -q -f name=hosting_redis) \
  redis-cli -a ${REDIS_PASSWORD} --no-auth-warning ping

# Check data exists
docker exec $(docker ps -q -f name=hosting_redis) \
  redis-cli -a ${REDIS_PASSWORD} --no-auth-warning DBSIZE

# Get Redis info
docker exec $(docker ps -q -f name=hosting_redis) \
  redis-cli -a ${REDIS_PASSWORD} --no-auth-warning INFO | head -20
```

### Step 7: Restore Docker Volumes

```bash
# Restore Prometheus data
PROMETHEUS_VOLUME=$(docker volume ls --filter "name=prometheus_data" --format "{{.Name}}")

docker run --rm \
  -v ${PROMETHEUS_VOLUME}:/data \
  -v ${BACKUP_DIR}/volumes:/backup \
  alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/prometheus-${BACKUP_ID}.tar.gz -C /data"

# Restore Grafana data
GRAFANA_VOLUME=$(docker volume ls --filter "name=grafana_data" --format "{{.Name}}")

docker run --rm \
  -v ${GRAFANA_VOLUME}:/data \
  -v ${BACKUP_DIR}/volumes:/backup \
  alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/grafana-${BACKUP_ID}.tar.gz -C /data"

# Restore Nginx logs (optional)
NGINX_LOGS_VOLUME=$(docker volume ls --filter "name=nginx_logs" --format "{{.Name}}")

docker run --rm \
  -v ${NGINX_LOGS_VOLUME}:/data \
  -v ${BACKUP_DIR}/volumes:/backup \
  alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/nginx-logs-${BACKUP_ID}.tar.gz -C /data"

echo "Volume restore completed"
```

**Verification:**
```bash
# Verify volumes restored
for volume in prometheus_data grafana_data nginx_logs; do
  echo "=== ${volume} ==="
  docker run --rm -v ${volume}:/data alpine ls -lh /data | head -10
done
```

### Step 8: Restore Configurations

```bash
# Restore Docker Compose configurations
tar xzf ${BACKUP_DIR}/configs/docker-compose-${BACKUP_ID}.tar.gz -C /

# Restore Nginx configurations
tar xzf ${BACKUP_DIR}/configs/nginx-config-${BACKUP_ID}.tar.gz -C /

# Restore Prometheus configurations
tar xzf ${BACKUP_DIR}/configs/prometheus-config-${BACKUP_ID}.tar.gz -C /

# Restore scripts
tar xzf ${BACKUP_DIR}/configs/scripts-${BACKUP_ID}.tar.gz -C /

# Restore cron jobs
if [ -f ${BACKUP_DIR}/configs/crontab-${BACKUP_ID}.txt ]; then
  crontab ${BACKUP_DIR}/configs/crontab-${BACKUP_ID}.txt
fi

echo "Configuration restore completed"
```

**Verification:**
```bash
# Verify configurations restored
ls -lh /opt/docker-compose/
ls -lh /mnt/nfs/nginx/conf.d/
ls -lh /opt/scripts/

# Verify cron jobs
crontab -l
```

### Step 9: Restore Application Code (if needed)

```bash
# Restore application code
if [ -f ${BACKUP_DIR}/app/applications-${BACKUP_ID}.tar.gz ]; then
  tar xzf ${BACKUP_DIR}/app/applications-${BACKUP_ID}.tar.gz -C /opt/
  
  echo "Application code restored"
fi

# Restore Docker images (if needed)
if ls ${BACKUP_DIR}/app/docker-image-*.tar.gz 1> /dev/null 2>&1; then
  for image_file in ${BACKUP_DIR}/app/docker-image-*.tar.gz; do
    echo "Loading $(basename ${image_file})..."
    gunzip -c ${image_file} | docker load
  done
  
  echo "Docker images restored"
fi
```

**Verification:**
```bash
# Verify application code
ls -lh /opt/applications/

# Verify Docker images
docker images | grep localhost:5000
```

### Step 10: Restart Services

```bash
# Restart infrastructure services (if they were stopped)
# docker stack deploy --compose-file /opt/docker-compose/hosting/docker-compose.prod.yml hosting

# Or restart individual services
docker service update --force hosting_postgres
docker service update --force hosting_redis
docker service update --force prometheus
docker service update --force grafana

# Wait for infrastructure to stabilize
sleep 60

# Verify infrastructure services
docker service ls | grep -E "postgres|redis|prometheus|grafana"

# Start application services
DESIRED_REPLICAS=5  # Adjust based on your configuration
docker service scale hosting_app=${DESIRED_REPLICAS}

# Monitor application startup
watch -n 5 'docker service ps hosting_app --filter "desired-state=running"'
```

**Verification:**
```bash
# Check all services running
docker service ls

# Check service health
for service in hosting_postgres hosting_redis hosting_app prometheus grafana; do
  echo "=== ${service} ==="
  docker service ps ${service} --filter "desired-state=running"
done

# Check for errors
docker service logs hosting_app --tail 50 | grep -i error
```

### Step 11: Disable Maintenance Mode

```bash
# Remove maintenance mode configuration
rm /mnt/nfs/nginx/conf.d/maintenance.conf

# Reload nginx
docker service update --force hosting_nginx

# Wait for nginx to reload
sleep 10

# Test application access
curl -f http://localhost/health

echo "Maintenance mode disabled"
```

**Verification:**
```bash
# Verify application is accessible
curl -I http://localhost/
# Should return 200 OK

# Test various endpoints
curl -f http://localhost/health
curl -f http://localhost/api/version

# Check nginx logs
docker service logs hosting_nginx --tail 20
```

### Step 12: Post-Restore Verification

```bash
# Comprehensive system check
echo "=== Post-Restore Verification ==="

# 1. Database connectivity
echo "1. Testing database connectivity..."
docker exec $(docker ps -q -f name=hosting_app | head -1) \
  sh -c 'psql -h postgres -U ${DB_USER} -d ${DB_NAME} -c "SELECT 1"' || echo "Database check failed"

# 2. Redis connectivity
echo "2. Testing Redis connectivity..."
docker exec $(docker ps -q -f name=hosting_app | head -1) \
  redis-cli -h redis -a ${REDIS_PASSWORD} ping || echo "Redis check failed"

# 3. Application functionality
echo "3. Testing application endpoints..."
curl -f http://localhost/health || echo "Health check failed"
curl -f http://localhost/api/version || echo "Version check failed"

# 4. Check data integrity
echo "4. Checking data integrity..."
docker exec -i $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'
SELECT count(*) as user_count FROM users;
SELECT count(*) as total_tables FROM information_schema.tables WHERE table_schema = 'public';
EOF

# 5. Monitor logs for errors
echo "5. Checking logs for errors..."
ERROR_COUNT=$(docker service logs hosting_app --since 10m | grep -i error | wc -l)
echo "Errors in last 10 minutes: ${ERROR_COUNT}"

# 6. Check service replicas
echo "6. Verifying service replicas..."
docker service ls | grep hosting_app

# 7. Test Prometheus metrics
echo "7. Testing monitoring..."
curl -s http://10.0.1.30:9090/-/healthy || echo "Prometheus not healthy"

# 8. Test Grafana
echo "8. Testing Grafana..."
curl -s http://10.0.1.30:3001/api/health || echo "Grafana not healthy"

echo "=== Verification Complete ==="
```

**Verification Checklist:**
- [ ] All services running
- [ ] Database accessible and data present
- [ ] Redis accessible
- [ ] Application endpoints responding
- [ ] No critical errors in logs
- [ ] Monitoring systems operational
- [ ] Load balancer routing correctly
- [ ] Performance metrics normal

### Step 13: Document Restore

```bash
# Log restore completion
cat >> /var/log/restore.log <<EOF
========================================
System Restore Completed
========================================
Date: $(date)
Restored From: ${BACKUP_ID}
Restore Type: Full System
Performed By: $(whoami)
Status: SUCCESS

Components Restored:
  ✓ PostgreSQL Database
  ✓ Redis Data
  ✓ Docker Volumes
  ✓ Configurations
  ✓ Application Code
  ✓ Docker Images

Verification:
  ✓ All services running
  ✓ Database accessible
  ✓ Application responding
  ✓ Monitoring operational

Downtime:
  Start: [maintenance_start_time]
  End: $(date)
  Duration: [calculated_duration]

Notes:
- Restore completed successfully
- All verification checks passed
- System returned to normal operation

Pre-Restore Backup:
  Location: ${PRE_RESTORE_BACKUP}

========================================

EOF

# Display completion message
cat /var/log/restore.log | tail -30
```

---

## Procedure - Database Only Restore

For restoring just the database without affecting other components:

```bash
# 1. Create current database backup
CURRENT_BACKUP="/tmp/postgres-pre-restore-$(date +%Y%m%d-%H%M%S).dump"
docker exec $(docker ps -q -f name=hosting_postgres) \
  pg_dump -U ${POSTGRES_USER} -d ${POSTGRES_DB} -F c \
  > ${CURRENT_BACKUP}

# 2. Scale down application
docker service scale hosting_app=0
sleep 30

# 3. Restore database (from Step 5 above)
# [Execute Step 5 from Full System Restore]

# 4. Restart application
docker service scale hosting_app=5

# 5. Verify
curl -f http://localhost/health
```

---

## Procedure - Selective Configuration Restore

For restoring specific configuration files:

```bash
# Restore specific nginx configuration
tar xzf ${BACKUP_DIR}/configs/nginx-config-${BACKUP_ID}.tar.gz \
  -C / \
  mnt/nfs/nginx/conf.d/app.conf

# Reload nginx
docker service update --force hosting_nginx

# Verify
curl -I http://localhost/
```

---

## Rollback After Failed Restore

If restore fails and system is unstable:

```bash
# 1. If pre-restore backup was created
LATEST_BACKUP=$(ls -td /mnt/nfs/backups/pre-restore-* | head -1)

# 2. Use the pre-restore backup to restore
export BACKUP_ID=$(basename ${LATEST_BACKUP})
export BACKUP_DIR=${LATEST_BACKUP}

# 3. Follow full restore procedure with pre-restore backup

# 4. Or if total failure, restore from last known good backup
LAST_GOOD_BACKUP=$(ls -td /mnt/nfs/backups/20* | grep -v pre-restore | head -1)
export BACKUP_DIR=${LAST_GOOD_BACKUP}
# Follow full restore procedure
```

---

## Troubleshooting

### Issue: Database Restore Fails with Permission Errors

**Resolution:**
```bash
# Restore with no-owner and no-privileges flags
docker exec $(docker ps -q -f name=hosting_postgres) \
  pg_restore -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  --no-owner --no-privileges \
  /tmp/postgres-${BACKUP_ID}.dump

# Fix permissions after restore
docker exec -i $(docker ps -q -f name=hosting_postgres) \
  psql -U postgres -d ${POSTGRES_DB} <<EOF
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${POSTGRES_USER};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${POSTGRES_USER};
EOF
```

### Issue: Service Won't Start After Restore

**Resolution:**
```bash
# Check service logs
docker service logs hosting_app --tail 100

# Verify configuration files
docker service inspect hosting_app --pretty

# Check environment variables
docker service inspect hosting_app \
  --format='{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}'

# Update service if needed
docker service update --force hosting_app
```

### Issue: Data Inconsistency After Restore

**Resolution:**
```bash
# Run database integrity checks
docker exec -i $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'
-- Check for missing foreign key constraints
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE contype = 'f';

-- Verify referential integrity
-- Add specific checks based on your schema
EOF

# Reindex database if needed
docker exec -i $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  -c "REINDEX DATABASE ${POSTGRES_DB};"
```

---

## Validation Checklist

- [ ] Correct backup identified and verified
- [ ] Pre-restore backup created
- [ ] Maintenance mode enabled
- [ ] Services stopped gracefully
- [ ] Database restored successfully
- [ ] Redis data restored
- [ ] Volumes restored
- [ ] Configurations restored
- [ ] Application code restored
- [ ] Services restarted
- [ ] Maintenance mode disabled
- [ ] Database connectivity verified
- [ ] Application functionality verified
- [ ] No critical errors in logs
- [ ] Monitoring operational
- [ ] Restore documented

---

## Related Runbooks

- [05-backup-procedures.md](./05-backup-procedures.md) - For creating backups
- [04-database-migration.md](./04-database-migration.md) - For database operations
- [08-platform-restart.md](./08-platform-restart.md) - For platform restarts

---

## References

- PostgreSQL Restore: https://www.postgresql.org/docs/current/backup.html
- Docker Volume Backup: https://docs.docker.com/storage/volumes/#back-up-restore-or-migrate-data-volumes
- Redis Backup and Restore: https://redis.io/topics/persistence
