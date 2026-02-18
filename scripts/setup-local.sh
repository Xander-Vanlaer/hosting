#!/usr/bin/env bash

# ============================================
# Local Development Setup Script
# ============================================
# This script prepares your local environment for running the hosting platform
# with Docker Compose. It creates necessary directories and validates the setup.

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "============================================"
echo "  Hosting Platform - Local Setup"
echo "============================================"
echo ""

# Function to print colored messages
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if Docker is installed
echo "Checking prerequisites..."
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi
print_success "Docker is installed"

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi
print_success "Docker Compose is installed"

# Check if Docker is running
if ! docker info &> /dev/null; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi
print_success "Docker is running"

echo ""
echo "Creating necessary directories..."

# Create upload directory for dashboard
mkdir -p uploads
print_success "Created uploads directory"

# Create data directories for volumes (optional, Docker will create them)
mkdir -p data/postgres
mkdir -p data/redis
mkdir -p data/prometheus
mkdir -p data/grafana
mkdir -p data/loki
print_success "Created data directories"

# Create logs directory
mkdir -p logs
print_success "Created logs directory"

echo ""
echo "Validating configuration files..."

# Check if required config files exist
REQUIRED_FILES=(
    "docker-compose.yml"
    "monitoring/prometheus/prometheus.yml"
    "docker/monitoring/grafana/datasources.yml"
    "docker/monitoring/loki/loki-config.yml"
    "docker/monitoring/promtail/promtail-config.yml"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        print_error "Required file not found: $file"
        exit 1
    fi
done
print_success "All required configuration files found"

# Check if .env file exists, if not create a sample one
if [ ! -f ".env" ]; then
    print_warning ".env file not found, creating sample .env file..."
    cat > .env << 'EOF'
# ============================================
# Environment Configuration
# ============================================

# Node Environment
NODE_ENV=development

# PostgreSQL Configuration
POSTGRES_DB=hosting
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change-this-in-production

# Redis Configuration
REDIS_PASSWORD=change-this-in-production

# Dashboard Configuration
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=admin
SESSION_SECRET=change-this-secret-in-production

# Grafana Configuration
GRAFANA_USER=admin
GRAFANA_PASSWORD=admin
EOF
    print_success "Created sample .env file - PLEASE REVIEW AND UPDATE PASSWORDS!"
else
    print_success ".env file already exists"
fi

echo ""
echo "Validating docker-compose.yml syntax..."
if docker-compose config > /dev/null 2>&1 || docker compose config > /dev/null 2>&1; then
    print_success "docker-compose.yml syntax is valid"
else
    print_error "docker-compose.yml has syntax errors"
    exit 1
fi

echo ""
echo "============================================"
echo "  Setup Complete! ✓"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Review and update .env file with secure passwords"
echo "  2. Run: docker-compose up -d"
echo "  3. Access dashboard at: http://localhost:5000"
echo "  4. Access Grafana at: http://localhost:3001"
echo "  5. Access Prometheus at: http://localhost:9090"
echo ""
echo "To start the platform:"
echo "  docker-compose up -d"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f"
echo ""
echo "To stop the platform:"
echo "  docker-compose down"
echo ""
