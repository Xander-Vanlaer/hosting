#!/bin/bash
# ============================================
# Deployment Script for Hosting Platform
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-production}
VERSION=${2:-latest}
STACK_NAME="hosting"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Hosting Platform Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Environment: ${YELLOW}${ENVIRONMENT}${NC}"
echo -e "Version: ${YELLOW}${VERSION}${NC}"
echo ""

# Check if running on Swarm manager
if ! docker info 2>/dev/null | grep -q "Swarm: active"; then
    echo -e "${RED}Error: Docker Swarm is not active${NC}"
    echo "This script must be run on a Swarm manager node"
    exit 1
fi

# Check if compose file exists
COMPOSE_FILE="docker-compose.prod.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}Error: ${COMPOSE_FILE} not found${NC}"
    exit 1
fi

# Export environment variables
if [ -f ".env" ]; then
    echo -e "${GREEN}Loading environment variables...${NC}"
    export $(grep -v '^#' .env | xargs)
else
    echo -e "${YELLOW}Warning: .env file not found${NC}"
fi

# Set version
export VERSION=$VERSION

# Deploy the stack
echo -e "${GREEN}Deploying stack '${STACK_NAME}'...${NC}"
docker stack deploy -c $COMPOSE_FILE --with-registry-auth $STACK_NAME

# Wait for services to start
echo -e "${GREEN}Waiting for services to start...${NC}"
sleep 10

# Check service status
echo -e "${GREEN}Service Status:${NC}"
docker stack ps $STACK_NAME --no-trunc

# List all services
echo ""
echo -e "${GREEN}Services:${NC}"
docker stack services $STACK_NAME

# Health check
echo ""
echo -e "${GREEN}Running health checks...${NC}"
sleep 20

HEALTH_CHECK_URL="http://localhost/health"
if curl -f -s $HEALTH_CHECK_URL > /dev/null; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${YELLOW}⚠ Health check failed - services may still be starting${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment completed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Monitor logs: docker service logs -f ${STACK_NAME}_app"
echo "Check services: docker stack services ${STACK_NAME}"
echo "Remove stack: docker stack rm ${STACK_NAME}"
