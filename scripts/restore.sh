#!/bin/bash
# ============================================
# Restore Script for Hosting Platform
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check arguments
if [ $# -lt 1 ]; then
    echo -e "${RED}Usage: $0 <backup_date> [restore_type]${NC}"
    echo "Example: $0 20260210_140000"
    echo "Example: $0 20260210_140000 database"
    echo "Example: $0 20260210_140000 volumes"
    exit 1
fi

BACKUP_DATE=$1
RESTORE_TYPE=${2:-all}
BACKUP_DIR=${BACKUP_DIR:-"/backups"}
POSTGRES_CONTAINER="postgres-primary"
POSTGRES_DB=${POSTGRES_DB:-"hosting_db"}
POSTGRES_USER=${POSTGRES_USER:-"hosting_user"}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Restore Process Started${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Backup Date: ${YELLOW}${BACKUP_DATE}${NC}"
echo -e "Restore Type: ${YELLOW}${RESTORE_TYPE}${NC}"

# Confirm
read -p "This will overwrite existing data. Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

# Restore database
if [ "$RESTORE_TYPE" == "all" ] || [ "$RESTORE_TYPE" == "database" ]; then
    DB_BACKUP="$BACKUP_DIR/db_${BACKUP_DATE}.sql.gz"
    
    if [ ! -f "$DB_BACKUP" ]; then
        echo -e "${RED}Error: Database backup not found: $DB_BACKUP${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${GREEN}Restoring database...${NC}"
    echo "Stopping application services..."
    docker service scale hosting_app=0
    
    sleep 5
    
    echo "Restoring database from $DB_BACKUP..."
    gunzip < $DB_BACKUP | docker exec -i $POSTGRES_CONTAINER psql -U $POSTGRES_USER $POSTGRES_DB
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Database restored successfully${NC}"
    else
        echo -e "${RED}✗ Database restore failed${NC}"
        exit 1
    fi
    
    echo "Restarting application services..."
    docker service scale hosting_app=5
fi

# Restore volumes
if [ "$RESTORE_TYPE" == "all" ] || [ "$RESTORE_TYPE" == "volumes" ]; then
    APP_BACKUP="$BACKUP_DIR/app_data_${BACKUP_DATE}.tar.gz"
    
    if [ -f "$APP_BACKUP" ]; then
        echo ""
        echo -e "${GREEN}Restoring application data...${NC}"
        docker service scale hosting_app=0
        sleep 5
        
        docker run --rm \
            -v hosting_app_data:/data \
            -v $BACKUP_DIR:/backup \
            ubuntu tar xzf /backup/app_data_${BACKUP_DATE}.tar.gz -C /
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ App data restored successfully${NC}"
        fi
        
        docker service scale hosting_app=5
    else
        echo -e "${YELLOW}⚠ App data backup not found, skipping${NC}"
    fi
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Restore Process Completed${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Verify data: docker exec $POSTGRES_CONTAINER psql -U $POSTGRES_USER -d $POSTGRES_DB -c 'SELECT COUNT(*) FROM users;'"
