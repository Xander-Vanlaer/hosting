#!/bin/bash
# ============================================
# Health Check Script
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

HEALTH_URL=${1:-"http://localhost/health"}
MAX_RETRIES=${2:-3}
RETRY_DELAY=${3:-5}

echo -e "${GREEN}Running health check on ${HEALTH_URL}${NC}"

for i in $(seq 1 $MAX_RETRIES); do
    echo "Attempt $i of $MAX_RETRIES..."
    
    if curl -f -s $HEALTH_URL; then
        echo ""
        echo -e "${GREEN}✓ Health check passed${NC}"
        exit 0
    fi
    
    if [ $i -lt $MAX_RETRIES ]; then
        echo -e "${YELLOW}Health check failed, retrying in ${RETRY_DELAY}s...${NC}"
        sleep $RETRY_DELAY
    fi
done

echo ""
echo -e "${RED}✗ Health check failed after $MAX_RETRIES attempts${NC}"
exit 1
