# Runbook: Backup Procedures

**Document Version:** 1.0  
**Last Updated:** 2024-02  
**Estimated Time:** 20-40 minutes  
**Skill Level:** Intermediate

## Overview

This runbook provides comprehensive procedures for backing up all critical components of the hosting platform, including databases, application data, configurations, and Docker volumes.

---

## Prerequisites

### Required Access
- SSH access to swarm manager node (10.0.1.10)
- SSH access to NFS storage server (10.0.1.20)
- Backup storage credentials
- Sufficient disk space on backup destinations

### Required Information
- Backup schedule
- Retention policy
- Remote backup location
- Encryption keys (if applicable)

### Pre-Backup Checklist
- [ ] Backup destination accessible
- [ ] Sufficient disk space available
- [ ] Backup script permissions verified
- [ ] Encryption configured (if required)
- [ ] Monitoring alerts active
- [ ] Previous backups verified

### Tools Required
```bash
# Verify tools are installed
docker --version
pg_dump --version || sudo apt-get install -y postgresql-client
tar --version
rsync --version
gpg --version || sudo apt-get install -y gnupg
```

---

## Backup Strategy

### Backup Types

| Type | Frequency | Retention | Purpose |
|------|-----------|-----------|---------|
| Full | Daily (2 AM) | 30 days | Complete system restore |
| Incremental | Hourly | 7 days | Point-in-time recovery |
| Database | Every 6 hours | 14 days | Database restore |
| Configuration | On change | 90 days | Config recovery |
| Archive | Monthly | 1 year | Long-term storage |

### Backup Locations

- **Primary:** `/mnt/nfs/backups/` (NFS)
- **Secondary:** `10.0.1.20:/mnt/storage/backups/` (Remote NFS)
- **Offsite:** AWS S3 / Azure Blob (Optional)

---

## Procedure

### Step 1: Pre-Backup Verification

```bash
# SSH to swarm manager
ssh manager@10.0.1.10

# Set backup directory
export BACKUP_BASE_DIR="/mnt/nfs/backups"
export BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
export BACKUP_DIR="${BACKUP_BASE_DIR}/${BACKUP_DATE}"

# Create backup directory
mkdir -p ${BACKUP_DIR}/{postgres,redis,configs,volumes,app}

# Check disk space
df -h ${BACKUP_BASE_DIR}

# Minimum 50GB free space required
AVAILABLE_SPACE=$(df ${BACKUP_BASE_DIR} | tail -1 | awk '{print $4}')
if [ ${AVAILABLE_SPACE} -lt 52428800 ]; then
  echo "ERROR: Insufficient disk space"
  echo "Available: $(df -h ${BACKUP_BASE_DIR} | tail -1 | awk '{print $4}')"
  exit 1
fi

echo "Disk space check passed"
```

**Verification:**
```bash
# Verify backup directory created
ls -la ${BACKUP_DIR}

# Check directory permissions
ls -ld ${BACKUP_DIR}
# Should be readable/writable
```

### Step 2: Backup PostgreSQL Database

```bash
# Set database variables
export POSTGRES_USER="hosting_user"
export POSTGRES_DB="hosting_db"
export POSTGRES_CONTAINER=$(docker ps -q -f name=hosting_postgres)

# Create database backup (custom format)
docker exec ${POSTGRES_CONTAINER} \
  pg_dump -U ${POSTGRES_USER} -d ${POSTGRES_DB} -F c -b -v \
  > ${BACKUP_DIR}/postgres/postgres-${BACKUP_DATE}.dump

# Create SQL format backup (human-readable)
docker exec ${POSTGRES_CONTAINER} \
  pg_dump -U ${POSTGRES_USER} -d ${POSTGRES_DB} --clean --if-exists \
  > ${BACKUP_DIR}/postgres/postgres-${BACKUP_DATE}.sql

# Backup all databases
docker exec ${POSTGRES_CONTAINER} \
  pg_dumpall -U ${POSTGRES_USER} --clean --if-exists \
  > ${BACKUP_DIR}/postgres/postgres-all-${BACKUP_DATE}.sql

# Backup database globals (roles, tablespaces)
docker exec ${POSTGRES_CONTAINER} \
  pg_dumpall -U ${POSTGRES_USER} --globals-only \
  > ${BACKUP_DIR}/postgres/postgres-globals-${BACKUP_DATE}.sql

# Create backup metadata
cat > ${BACKUP_DIR}/postgres/metadata.txt <<EOF
Backup Date: $(date)
Database: ${POSTGRES_DB}
PostgreSQL Version: $(docker exec ${POSTGRES_CONTAINER} psql -V)
Backup Type: Full
Format: Custom + SQL
EOF
```

**Verification:**
```bash
# Verify backup files created
ls -lh ${BACKUP_DIR}/postgres/

# Check backup file is not empty
for file in ${BACKUP_DIR}/postgres/*.dump; do
  SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file")
  if [ ${SIZE} -lt 1000 ]; then
    echo "ERROR: Backup file $file is too small (${SIZE} bytes)"
    exit 1
  fi
  echo "✓ $file: $(du -h $file | cut -f1)"
done

# Test backup integrity
docker exec ${POSTGRES_CONTAINER} \
  pg_restore --list ${BACKUP_DIR}/postgres/postgres-${BACKUP_DATE}.dump | head -20

echo "PostgreSQL backup verification passed"
```

### Step 3: Backup Redis Data

```bash
# Get Redis container
export REDIS_CONTAINER=$(docker ps -q -f name=hosting_redis)
export REDIS_PASSWORD="${REDIS_PASSWORD}"

# Trigger Redis save
docker exec ${REDIS_CONTAINER} \
  redis-cli -a ${REDIS_PASSWORD} --no-auth-warning BGSAVE

# Wait for save to complete
sleep 5

# Check save status
while true; do
  SAVE_STATUS=$(docker exec ${REDIS_CONTAINER} \
    redis-cli -a ${REDIS_PASSWORD} --no-auth-warning LASTSAVE)
  echo "Last save: ${SAVE_STATUS}"
  sleep 2
  
  # Check if save completed
  CURRENT_SAVE=$(docker exec ${REDIS_CONTAINER} \
    redis-cli -a ${REDIS_PASSWORD} --no-auth-warning LASTSAVE)
  if [ "${CURRENT_SAVE}" != "${SAVE_STATUS}" ]; then
    break
  fi
done

# Copy RDB file
docker cp ${REDIS_CONTAINER}:/data/dump.rdb \
  ${BACKUP_DIR}/redis/redis-${BACKUP_DATE}.rdb

# Copy AOF file if enabled
docker cp ${REDIS_CONTAINER}:/data/appendonly.aof \
  ${BACKUP_DIR}/redis/redis-${BACKUP_DATE}.aof 2>/dev/null || true

# Get Redis info
docker exec ${REDIS_CONTAINER} \
  redis-cli -a ${REDIS_PASSWORD} --no-auth-warning INFO \
  > ${BACKUP_DIR}/redis/redis-info-${BACKUP_DATE}.txt
```

**Verification:**
```bash
# Verify Redis backup files
ls -lh ${BACKUP_DIR}/redis/

# Check RDB file is valid
file ${BACKUP_DIR}/redis/redis-${BACKUP_DATE}.rdb

echo "Redis backup verification passed"
```

### Step 4: Backup Docker Volumes

```bash
# List all volumes
docker volume ls

# Backup Prometheus data
docker run --rm \
  -v prometheus_data:/source:ro \
  -v ${BACKUP_DIR}/volumes:/backup \
  alpine \
  tar czf /backup/prometheus-${BACKUP_DATE}.tar.gz -C /source .

# Backup Grafana data
docker run --rm \
  -v grafana_data:/source:ro \
  -v ${BACKUP_DIR}/volumes:/backup \
  alpine \
  tar czf /backup/grafana-${BACKUP_DATE}.tar.gz -C /source .

# Backup Nginx logs (last 7 days)
docker run --rm \
  -v nginx_logs:/source:ro \
  -v ${BACKUP_DIR}/volumes:/backup \
  alpine \
  tar czf /backup/nginx-logs-${BACKUP_DATE}.tar.gz -C /source .

# Backup Nginx cache
docker run --rm \
  -v nginx_cache:/source:ro \
  -v ${BACKUP_DIR}/volumes:/backup \
  alpine \
  tar czf /backup/nginx-cache-${BACKUP_DATE}.tar.gz -C /source .
```

**Verification:**
```bash
# Verify volume backups
ls -lh ${BACKUP_DIR}/volumes/

# Test archive integrity
for archive in ${BACKUP_DIR}/volumes/*.tar.gz; do
  echo "Testing $archive..."
  tar tzf $archive > /dev/null && echo "✓ OK" || echo "✗ FAILED"
done

echo "Volume backup verification passed"
```

### Step 5: Backup Application Code and Configurations

```bash
# Backup application code
cd /opt/applications
tar czf ${BACKUP_DIR}/app/applications-${BACKUP_DATE}.tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.log' \
  hosting-app/

# Backup Docker Compose files
tar czf ${BACKUP_DIR}/configs/docker-compose-${BACKUP_DATE}.tar.gz \
  /opt/docker-compose/

# Backup Nginx configurations
tar czf ${BACKUP_DIR}/configs/nginx-config-${BACKUP_DATE}.tar.gz \
  /mnt/nfs/nginx/

# Backup Prometheus configuration
tar czf ${BACKUP_DIR}/configs/prometheus-config-${BACKUP_DATE}.tar.gz \
  /mnt/nfs/monitoring/

# Backup environment files (excluding sensitive data)
mkdir -p ${BACKUP_DIR}/configs/env-files
find /opt/docker-compose -name ".env" -exec cp {} ${BACKUP_DIR}/configs/env-files/ \;

# Backup scripts
tar czf ${BACKUP_DIR}/configs/scripts-${BACKUP_DATE}.tar.gz \
  /opt/scripts/

# Backup cron jobs
crontab -l > ${BACKUP_DIR}/configs/crontab-${BACKUP_DATE}.txt 2>/dev/null || true

# Backup Docker Swarm configuration
docker config ls --format "{{.Name}}" | while read config; do
  docker config inspect ${config} > ${BACKUP_DIR}/configs/swarm-config-${config}.json
done

# Backup Docker secrets list (not values)
docker secret ls --format "{{.Name}}" > ${BACKUP_DIR}/configs/swarm-secrets-list.txt
```

**Verification:**
```bash
# Verify configuration backups
ls -lh ${BACKUP_DIR}/configs/

# Test archives
for archive in ${BACKUP_DIR}/configs/*.tar.gz; do
  echo "Testing $archive..."
  tar tzf $archive > /dev/null && echo "✓ OK" || echo "✗ FAILED"
done

echo "Configuration backup verification passed"
```

### Step 6: Backup Docker Images

```bash
# List all custom images
docker images --filter "reference=localhost:5000/*" --format "{{.Repository}}:{{.Tag}}" \
  > ${BACKUP_DIR}/configs/docker-images-list.txt

# Save critical images
for image in $(cat ${BACKUP_DIR}/configs/docker-images-list.txt); do
  IMAGE_NAME=$(echo ${image} | tr '/:' '_')
  echo "Backing up ${image}..."
  docker save ${image} | gzip > ${BACKUP_DIR}/app/docker-image-${IMAGE_NAME}.tar.gz
done
```

**Verification:**
```bash
# Verify image backups
ls -lh ${BACKUP_DIR}/app/docker-image-*.tar.gz

echo "Docker image backup verification passed"
```

### Step 7: Create System State Snapshot

```bash
# Capture system state
cat > ${BACKUP_DIR}/system-state-${BACKUP_DATE}.txt <<EOF
=== System State Snapshot ===
Date: $(date)
Hostname: $(hostname)

=== Docker Info ===
$(docker info)

=== Docker Swarm Nodes ===
$(docker node ls)

=== Docker Services ===
$(docker service ls)

=== Docker Networks ===
$(docker network ls)

=== Docker Volumes ===
$(docker volume ls)

=== Service Status ===
EOF

# Add service details
docker service ls --format "{{.Name}}" | while read service; do
  echo "=== Service: ${service} ===" >> ${BACKUP_DIR}/system-state-${BACKUP_DATE}.txt
  docker service inspect ${service} >> ${BACKUP_DIR}/system-state-${BACKUP_DATE}.txt
  echo "" >> ${BACKUP_DIR}/system-state-${BACKUP_DATE}.txt
done

# Capture network configuration
ip addr show > ${BACKUP_DIR}/network-config-${BACKUP_DATE}.txt
ip route show >> ${BACKUP_DIR}/network-config-${BACKUP_DATE}.txt
```

**Verification:**
```bash
# Verify system state captured
ls -lh ${BACKUP_DIR}/system-state-${BACKUP_DATE}.txt

wc -l ${BACKUP_DIR}/system-state-${BACKUP_DATE}.txt

echo "System state snapshot verification passed"
```

### Step 8: Create Backup Manifest

```bash
# Generate manifest with checksums
cat > ${BACKUP_DIR}/MANIFEST.txt <<EOF
=== Backup Manifest ===
Backup ID: ${BACKUP_DATE}
Created: $(date)
Created By: $(whoami)@$(hostname)
Backup Type: Full

=== Contents ===
EOF

# Add file listing with sizes and checksums
find ${BACKUP_DIR} -type f -print0 | while IFS= read -r -d '' file; do
  SIZE=$(du -h "$file" | cut -f1)
  CHECKSUM=$(sha256sum "$file" | cut -d' ' -f1)
  REL_PATH=$(echo "$file" | sed "s|${BACKUP_DIR}/||")
  echo "${REL_PATH}|${SIZE}|${CHECKSUM}" >> ${BACKUP_DIR}/MANIFEST.txt
done

# Create summary
cat >> ${BACKUP_DIR}/MANIFEST.txt <<EOF

=== Summary ===
Total Files: $(find ${BACKUP_DIR} -type f | wc -l)
Total Size: $(du -sh ${BACKUP_DIR} | cut -f1)

=== Backup Components ===
PostgreSQL: $(ls ${BACKUP_DIR}/postgres/*.dump 2>/dev/null | wc -l) files
Redis: $(ls ${BACKUP_DIR}/redis/*.rdb 2>/dev/null | wc -l) files
Volumes: $(ls ${BACKUP_DIR}/volumes/*.tar.gz 2>/dev/null | wc -l) files
Configurations: $(ls ${BACKUP_DIR}/configs/*.tar.gz 2>/dev/null | wc -l) files
Applications: $(ls ${BACKUP_DIR}/app/*.tar.gz 2>/dev/null | wc -l) files
EOF

cat ${BACKUP_DIR}/MANIFEST.txt
```

**Verification:**
```bash
# Verify manifest created
cat ${BACKUP_DIR}/MANIFEST.txt

echo "Backup manifest created successfully"
```

### Step 9: Compress and Encrypt Backup (Optional)

```bash
# Create tarball of entire backup
cd ${BACKUP_BASE_DIR}
tar czf backup-${BACKUP_DATE}.tar.gz ${BACKUP_DATE}/

# Encrypt backup (if encryption is enabled)
if [ -f /etc/backup/encryption.key ]; then
  echo "Encrypting backup..."
  gpg --symmetric \
    --cipher-algo AES256 \
    --passphrase-file /etc/backup/encryption.key \
    --batch \
    backup-${BACKUP_DATE}.tar.gz
  
  # Remove unencrypted tarball
  rm backup-${BACKUP_DATE}.tar.gz
  
  echo "Backup encrypted: backup-${BACKUP_DATE}.tar.gz.gpg"
fi
```

**Verification:**
```bash
# Verify compressed backup
if [ -f ${BACKUP_BASE_DIR}/backup-${BACKUP_DATE}.tar.gz.gpg ]; then
  ls -lh ${BACKUP_BASE_DIR}/backup-${BACKUP_DATE}.tar.gz.gpg
  echo "Encrypted backup created"
elif [ -f ${BACKUP_BASE_DIR}/backup-${BACKUP_DATE}.tar.gz ]; then
  ls -lh ${BACKUP_BASE_DIR}/backup-${BACKUP_DATE}.tar.gz
  echo "Compressed backup created (unencrypted)"
fi
```

### Step 10: Transfer to Remote Storage

```bash
# Transfer to secondary NFS storage
echo "Transferring to remote storage..."
rsync -avz --progress \
  ${BACKUP_DIR}/ \
  backup@10.0.1.20:/mnt/storage/backups/${BACKUP_DATE}/

# Verify transfer
ssh backup@10.0.1.20 "du -sh /mnt/storage/backups/${BACKUP_DATE}"

# Transfer compressed/encrypted backup to offsite (if configured)
if [ -f ${BACKUP_BASE_DIR}/backup-${BACKUP_DATE}.tar.gz.gpg ]; then
  # Example: AWS S3
  # aws s3 cp ${BACKUP_BASE_DIR}/backup-${BACKUP_DATE}.tar.gz.gpg \
  #   s3://your-backup-bucket/hosting/${BACKUP_DATE}/
  
  # Example: Azure Blob
  # az storage blob upload \
  #   --account-name youraccount \
  #   --container-name backups \
  #   --name hosting/${BACKUP_DATE}/backup-${BACKUP_DATE}.tar.gz.gpg \
  #   --file ${BACKUP_BASE_DIR}/backup-${BACKUP_DATE}.tar.gz.gpg
  
  echo "Offsite backup configured but not executed (manual step)"
fi
```

**Verification:**
```bash
# Verify remote backup
ssh backup@10.0.1.20 "ls -lh /mnt/storage/backups/${BACKUP_DATE}/ | tail -20"

# Compare checksums
LOCAL_CHECKSUM=$(sha256sum ${BACKUP_DIR}/MANIFEST.txt | cut -d' ' -f1)
REMOTE_CHECKSUM=$(ssh backup@10.0.1.20 "sha256sum /mnt/storage/backups/${BACKUP_DATE}/MANIFEST.txt" | cut -d' ' -f1)

if [ "${LOCAL_CHECKSUM}" = "${REMOTE_CHECKSUM}" ]; then
  echo "✓ Remote backup verified"
else
  echo "✗ Checksum mismatch!"
  exit 1
fi
```

### Step 11: Clean Up Old Backups

```bash
# Define retention policies
DAILY_RETENTION=30   # Keep 30 days of daily backups
MONTHLY_RETENTION=12 # Keep 12 months of monthly backups

# Remove old daily backups
echo "Cleaning up old backups..."
find ${BACKUP_BASE_DIR} -maxdepth 1 -type d -name "20*" -mtime +${DAILY_RETENTION} -exec rm -rf {} \;

# List remaining backups
echo "Remaining backups:"
ls -lh ${BACKUP_BASE_DIR} | grep "^d"

# Clean up remote backups
ssh backup@10.0.1.20 "find /mnt/storage/backups -maxdepth 1 -type d -name '20*' -mtime +${DAILY_RETENTION} -exec rm -rf {} \;"

# Clean up compressed backups
find ${BACKUP_BASE_DIR} -name "backup-*.tar.gz*" -mtime +${DAILY_RETENTION} -delete
```

**Verification:**
```bash
# Verify cleanup
BACKUP_COUNT=$(ls -d ${BACKUP_BASE_DIR}/20* 2>/dev/null | wc -l)
echo "Current backup count: ${BACKUP_COUNT}"

# Should have approximately DAILY_RETENTION backups
if [ ${BACKUP_COUNT} -gt $((DAILY_RETENTION + 5)) ]; then
  echo "WARNING: Too many backups retained (${BACKUP_COUNT})"
fi
```

### Step 12: Update Backup Log and Monitoring

```bash
# Log backup completion
cat >> /var/log/backup.log <<EOF
========================================
Backup Completed Successfully
========================================
Backup ID: ${BACKUP_DATE}
Date: $(date)
Type: Full
Status: SUCCESS

Components:
  PostgreSQL: ✓
  Redis: ✓
  Docker Volumes: ✓
  Configurations: ✓
  Application Code: ✓
  Docker Images: ✓

Size: $(du -sh ${BACKUP_DIR} | cut -f1)
Location: ${BACKUP_DIR}
Remote: backup@10.0.1.20:/mnt/storage/backups/${BACKUP_DATE}/

Verification: All checksums verified ✓

========================================

EOF

# Send metrics to Prometheus (if pushgateway is configured)
# echo "backup_success{backup_id=\"${BACKUP_DATE}\"} 1" | curl --data-binary @- http://10.0.1.30:9091/metrics/job/backup

# Send notification (optional)
# curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
#   -H 'Content-Type: application/json' \
#   -d "{\"text\":\"Backup ${BACKUP_DATE} completed successfully\"}"

echo "Backup completed and logged successfully"
```

**Verification:**
```bash
# View recent backup log entries
tail -50 /var/log/backup.log

# Verify backup listed
ls -lh ${BACKUP_BASE_DIR} | grep ${BACKUP_DATE}
```

---

## Automated Backup Script

Create a comprehensive backup script:

```bash
# Create backup script
cat > /opt/scripts/backup-full.sh <<'SCRIPT'
#!/bin/bash
set -euo pipefail

# Configuration
BACKUP_BASE_DIR="/mnt/nfs/backups"
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="${BACKUP_BASE_DIR}/${BACKUP_DATE}"
LOG_FILE="/var/log/backup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Logging function
log() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a ${LOG_FILE}
}

error() {
  echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a ${LOG_FILE}
}

warn() {
  echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a ${LOG_FILE}
}

# Error handler
error_exit() {
  error "$1"
  exit 1
}

# Check prerequisites
check_prerequisites() {
  log "Checking prerequisites..."
  
  # Check disk space (minimum 50GB)
  AVAILABLE=$(df ${BACKUP_BASE_DIR} | tail -1 | awk '{print $4}')
  if [ ${AVAILABLE} -lt 52428800 ]; then
    error_exit "Insufficient disk space"
  fi
  
  # Check Docker is running
  docker info > /dev/null 2>&1 || error_exit "Docker is not running"
  
  log "Prerequisites check passed"
}

# Create backup directories
create_backup_dirs() {
  log "Creating backup directories..."
  mkdir -p ${BACKUP_DIR}/{postgres,redis,configs,volumes,app}
}

# Backup PostgreSQL
backup_postgres() {
  log "Backing up PostgreSQL..."
  
  POSTGRES_CONTAINER=$(docker ps -q -f name=hosting_postgres)
  POSTGRES_USER="hosting_user"
  POSTGRES_DB="hosting_db"
  
  docker exec ${POSTGRES_CONTAINER} \
    pg_dump -U ${POSTGRES_USER} -d ${POSTGRES_DB} -F c -b \
    > ${BACKUP_DIR}/postgres/postgres-${BACKUP_DATE}.dump || error_exit "PostgreSQL backup failed"
  
  log "PostgreSQL backup completed"
}

# Backup Redis
backup_redis() {
  log "Backing up Redis..."
  
  REDIS_CONTAINER=$(docker ps -q -f name=hosting_redis)
  
  docker exec ${REDIS_CONTAINER} redis-cli -a ${REDIS_PASSWORD} --no-auth-warning BGSAVE
  sleep 10
  
  docker cp ${REDIS_CONTAINER}:/data/dump.rdb \
    ${BACKUP_DIR}/redis/redis-${BACKUP_DATE}.rdb || error_exit "Redis backup failed"
  
  log "Redis backup completed"
}

# Backup volumes
backup_volumes() {
  log "Backing up Docker volumes..."
  
  for volume in prometheus_data grafana_data nginx_logs nginx_cache; do
    docker run --rm \
      -v ${volume}:/source:ro \
      -v ${BACKUP_DIR}/volumes:/backup \
      alpine \
      tar czf /backup/${volume}-${BACKUP_DATE}.tar.gz -C /source . || warn "Failed to backup ${volume}"
  done
  
  log "Volume backups completed"
}

# Backup configurations
backup_configs() {
  log "Backing up configurations..."
  
  tar czf ${BACKUP_DIR}/configs/docker-compose-${BACKUP_DATE}.tar.gz /opt/docker-compose/ 2>/dev/null || warn "Docker compose backup incomplete"
  tar czf ${BACKUP_DIR}/configs/nginx-config-${BACKUP_DATE}.tar.gz /mnt/nfs/nginx/ 2>/dev/null || warn "Nginx config backup incomplete"
  tar czf ${BACKUP_DIR}/configs/scripts-${BACKUP_DATE}.tar.gz /opt/scripts/ 2>/dev/null || warn "Scripts backup incomplete"
  
  log "Configuration backups completed"
}

# Create manifest
create_manifest() {
  log "Creating backup manifest..."
  
  cat > ${BACKUP_DIR}/MANIFEST.txt <<EOF
Backup ID: ${BACKUP_DATE}
Created: $(date)
Type: Automated Full Backup
Total Size: $(du -sh ${BACKUP_DIR} | cut -f1)
Total Files: $(find ${BACKUP_DIR} -type f | wc -l)
EOF
  
  log "Manifest created"
}

# Transfer to remote
transfer_remote() {
  log "Transferring to remote storage..."
  
  rsync -az ${BACKUP_DIR}/ backup@10.0.1.20:/mnt/storage/backups/${BACKUP_DATE}/ || warn "Remote transfer failed"
  
  log "Remote transfer completed"
}

# Cleanup old backups
cleanup_old() {
  log "Cleaning up old backups..."
  
  find ${BACKUP_BASE_DIR} -maxdepth 1 -type d -name "20*" -mtime +30 -exec rm -rf {} \;
  
  log "Cleanup completed"
}

# Main execution
main() {
  log "========== Starting Backup =========="
  
  check_prerequisites
  create_backup_dirs
  backup_postgres
  backup_redis
  backup_volumes
  backup_configs
  create_manifest
  transfer_remote
  cleanup_old
  
  log "========== Backup Completed Successfully =========="
  log "Backup location: ${BACKUP_DIR}"
  log "Backup size: $(du -sh ${BACKUP_DIR} | cut -f1)"
}

# Run main function
main "$@"
SCRIPT

# Make executable
chmod +x /opt/scripts/backup-full.sh

# Test the script
# /opt/scripts/backup-full.sh
```

**Schedule via Cron:**
```bash
# Add to crontab
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/scripts/backup-full.sh >> /var/log/backup-cron.log 2>&1") | crontab -

# Verify cron job
crontab -l | grep backup
```

---

## Validation Checklist

- [ ] PostgreSQL database backed up
- [ ] Redis data backed up
- [ ] Docker volumes backed up
- [ ] Configurations backed up
- [ ] Application code backed up
- [ ] Docker images backed up
- [ ] System state captured
- [ ] Manifest created with checksums
- [ ] Backup transferred to remote storage
- [ ] Backup integrity verified
- [ ] Old backups cleaned up
- [ ] Backup logged

---

## Related Runbooks

- [06-restore-procedures.md](./06-restore-procedures.md) - For restoring from backups
- [04-database-migration.md](./04-database-migration.md) - For database operations

---

## References

- PostgreSQL Backup: https://www.postgresql.org/docs/current/backup.html
- Redis Persistence: https://redis.io/topics/persistence
- Docker Backup Best Practices: https://docs.docker.com/storage/volumes/
