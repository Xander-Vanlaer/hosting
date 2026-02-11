#!/bin/bash
# ============================================
# Backup Script for Hosting Platform
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
BACKUP_DIR=${BACKUP_DIR:-"/backups"}
DATE=$(date +%Y%m%d_%H%M%S)
POSTGRES_CONTAINER="postgres-primary"
POSTGRES_DB=${POSTGRES_DB:-"hosting_db"}
POSTGRES_USER=${POSTGRES_USER:-"hosting_user"}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Backup Process Started${NC}"
echo -e "${GREEN}========================================${NC}"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
echo -e "${GREEN}Backing up PostgreSQL database...${NC}"
docker exec $POSTGRES_CONTAINER pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip > $BACKUP_DIR/db_${DATE}.sql.gz

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database backup completed: db_${DATE}.sql.gz${NC}"
    ls -lh $BACKUP_DIR/db_${DATE}.sql.gz
else
    echo -e "${YELLOW}⚠ Database backup failed${NC}"
fi

# Backup volumes
echo ""
echo -e "${GREEN}Backing up volumes...${NC}"

# Stop services temporarily (optional - comment out if you want hot backups)
# echo "Scaling down app services..."
# docker service scale hosting_app=0

# Backup app data volume
echo "Backing up application data..."
docker run --rm \
    -v hosting_app_data:/data \
    -v $BACKUP_DIR:/backup \
    ubuntu tar czf /backup/app_data_${DATE}.tar.gz /data

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ App data backup completed: app_data_${DATE}.tar.gz${NC}"
fi

# Backup Redis data
echo "Backing up Redis data..."
docker run --rm \
    -v redis_data:/data \
    -v $BACKUP_DIR:/backup \
    ubuntu tar czf /backup/redis_data_${DATE}.tar.gz /data

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Redis data backup completed: redis_data_${DATE}.tar.gz${NC}"
fi

# Restart services if they were stopped
# echo "Scaling up app services..."
# docker service scale hosting_app=5

# Cleanup old backups (keep last 7 days)
echo ""
echo -e "${GREEN}Cleaning up old backups (keeping last 7 days)...${NC}"
find $BACKUP_DIR -name "*.gz" -type f -mtime +7 -delete

# List backups
echo ""
echo -e "${GREEN}Current backups:${NC}"
ls -lh $BACKUP_DIR/*.gz 2>/dev/null | tail -10

# Calculate total backup size
TOTAL_SIZE=$(du -sh $BACKUP_DIR | cut -f1)
echo ""
echo -e "${GREEN}Total backup size: ${TOTAL_SIZE}${NC}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Backup Process Completed${NC}"
echo -e "${GREEN}========================================${NC}"
