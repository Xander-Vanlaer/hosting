# Runbook: Deploy New Application

**Document Version:** 1.0  
**Last Updated:** 2024-02  
**Estimated Time:** 30-45 minutes  
**Skill Level:** Intermediate

## Overview

This runbook guides you through deploying a new application to the Docker Swarm platform. This includes building container images, pushing to the registry, and deploying to the swarm cluster.

---

## Prerequisites

### Required Access
- SSH access to swarm manager node (10.0.1.10)
- Docker registry credentials
- Git repository access
- Sudo privileges on manager node

### Required Information
- Application name and version
- Environment variables for the application
- Resource requirements (CPU, memory)
- Network requirements
- Health check endpoint

### Tools Required
```bash
# Verify tools are installed
docker --version
docker-compose --version
git --version
```

### Pre-Deployment Checklist
- [ ] Application code reviewed and tested
- [ ] Dockerfile optimized and security scanned
- [ ] Environment variables documented
- [ ] Health check endpoint implemented
- [ ] Resource limits defined
- [ ] Backup of current state completed

---

## Procedure

### Step 1: Prepare Application Code

```bash
# Clone or update application repository
cd /opt/applications
git clone https://github.com/your-org/your-app.git
cd your-app

# Checkout specific version/tag
git checkout tags/v1.0.0

# Verify Dockerfile exists
ls -la Dockerfile
```

**Verification:**
```bash
# Review Dockerfile
cat Dockerfile

# Ensure .dockerignore exists
cat .dockerignore
```

### Step 2: Build Docker Image

```bash
# Set variables
export APP_NAME="your-app"
export APP_VERSION="1.0.0"
export DOCKER_REGISTRY="localhost:5000"
export IMAGE_TAG="${DOCKER_REGISTRY}/${APP_NAME}:${APP_VERSION}"

# Build the image
docker build \
  --tag ${IMAGE_TAG} \
  --tag ${DOCKER_REGISTRY}/${APP_NAME}:latest \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  --build-arg VERSION=${APP_VERSION} \
  --no-cache \
  .
```

**Verification:**
```bash
# Verify image was created
docker images | grep ${APP_NAME}

# Inspect image
docker inspect ${IMAGE_TAG}

# Check image size
docker images ${IMAGE_TAG} --format "{{.Size}}"
```

### Step 3: Test Image Locally

```bash
# Run container locally for testing
docker run -d \
  --name ${APP_NAME}-test \
  -p 8080:3000 \
  -e NODE_ENV=production \
  ${IMAGE_TAG}

# Wait for container to start
sleep 10

# Check container status
docker ps | grep ${APP_NAME}-test

# Test health endpoint
curl -f http://localhost:8080/health || echo "Health check failed"

# Check logs
docker logs ${APP_NAME}-test

# Stop and remove test container
docker stop ${APP_NAME}-test
docker rm ${APP_NAME}-test
```

**Verification:**
```bash
# Ensure test container is removed
docker ps -a | grep ${APP_NAME}-test && echo "Container still exists" || echo "Clean"
```

### Step 4: Scan Image for Vulnerabilities

```bash
# Scan with Docker Scout (if available)
docker scout cves ${IMAGE_TAG}

# Or use Trivy
trivy image --severity HIGH,CRITICAL ${IMAGE_TAG}
```

**Verification:**
- Review scan results
- Address critical vulnerabilities before proceeding
- Document any accepted risks

### Step 5: Push Image to Registry

```bash
# Login to registry (if not already authenticated)
docker login ${DOCKER_REGISTRY}

# Push versioned tag
docker push ${IMAGE_TAG}

# Push latest tag
docker push ${DOCKER_REGISTRY}/${APP_NAME}:latest
```

**Verification:**
```bash
# Verify image in registry
curl -X GET http://${DOCKER_REGISTRY}/v2/${APP_NAME}/tags/list

# Or using Docker
docker pull ${IMAGE_TAG}
docker images | grep ${IMAGE_TAG}
```

### Step 6: Create Docker Compose Configuration

```bash
# Create service directory
mkdir -p /opt/docker-compose/${APP_NAME}
cd /opt/docker-compose/${APP_NAME}

# Create docker-compose.yml
cat > docker-compose.yml <<'EOF'
version: '3.9'

services:
  your-app:
    image: ${DOCKER_REGISTRY}/your-app:${VERSION}
    networks:
      - backend
      - database
      - cache
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=${DB_NAME}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    deploy:
      mode: replicated
      replicas: 3
      placement:
        constraints:
          - node.role == worker
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
        monitor: 30s
      rollback_config:
        parallelism: 1
        delay: 5s
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 30s

networks:
  backend:
    external: true
  database:
    external: true
  cache:
    external: true
EOF
```

**Verification:**
```bash
# Validate docker-compose file
docker-compose config
```

### Step 7: Create Environment File

```bash
# Create .env file with all required variables
cat > .env <<EOF
DOCKER_REGISTRY=localhost:5000
VERSION=${APP_VERSION}
DB_NAME=your_app_db
DB_USER=app_user
DB_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
EOF

# Secure the environment file
chmod 600 .env

# Backup environment file to secure location
sudo cp .env /etc/docker/compose/${APP_NAME}/.env.backup
```

**Verification:**
```bash
# Verify environment file
cat .env | grep -v PASSWORD
```

### Step 8: Deploy to Docker Swarm

```bash
# SSH to swarm manager
ssh manager@10.0.1.10

# Navigate to compose directory
cd /opt/docker-compose/${APP_NAME}

# Deploy the stack
docker stack deploy \
  --compose-file docker-compose.yml \
  --with-registry-auth \
  ${APP_NAME}
```

**Verification:**
```bash
# Check stack status
docker stack ls | grep ${APP_NAME}

# List services
docker stack services ${APP_NAME}

# Check service details
docker service ls | grep ${APP_NAME}

# View service logs
docker service logs ${APP_NAME}_your-app --tail 50
```

### Step 9: Monitor Deployment Progress

```bash
# Watch service converge to desired state
watch -n 2 'docker service ps ${APP_NAME}_your-app --no-trunc'

# Check replica status
docker service ps ${APP_NAME}_your-app --filter "desired-state=running"

# Monitor logs in real-time
docker service logs -f ${APP_NAME}_your-app
```

**Success Criteria:**
- All replicas show as "Running"
- Health checks passing
- No error messages in logs
- Service accessible via network

### Step 10: Verify Application Functionality

```bash
# Get service virtual IP
docker service inspect ${APP_NAME}_your-app \
  --format='{{range .Endpoint.VirtualIPs}}{{.Addr}}{{end}}'

# Test health endpoint from manager
curl -f http://localhost:3000/health

# Test from worker node
ssh worker@10.0.1.11
curl -f http://<service-vip>:3000/health

# Check database connectivity
docker exec -it $(docker ps -q -f name=${APP_NAME}_your-app) \
  sh -c 'psql -h postgres -U ${DB_USER} -d ${DB_NAME} -c "SELECT 1"'

# Verify Redis connectivity
docker exec -it $(docker ps -q -f name=${APP_NAME}_your-app) \
  sh -c 'redis-cli -h redis -a ${REDIS_PASSWORD} ping'
```

**Verification:**
- Health endpoint returns 200 OK
- Database queries execute successfully
- Redis connectivity confirmed
- Application logs show no errors

### Step 11: Configure Load Balancer

```bash
# Update nginx configuration to include new service
ssh manager@10.0.1.10

# Edit nginx config
sudo vi /mnt/nfs/nginx/conf.d/${APP_NAME}.conf

# Add upstream configuration
cat >> /mnt/nfs/nginx/conf.d/${APP_NAME}.conf <<'EOF'
upstream your_app_backend {
    least_conn;
    server your-app:3000 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name your-app.example.com;

    location / {
        proxy_pass http://your_app_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://your_app_backend/health;
        access_log off;
    }
}
EOF

# Reload nginx
docker service update --force hosting_nginx
```

**Verification:**
```bash
# Test through nginx
curl -H "Host: your-app.example.com" http://10.0.1.10/health

# Check nginx logs
docker service logs hosting_nginx --tail 20
```

### Step 12: Update Monitoring

```bash
# Add service to Prometheus targets
cat >> /mnt/nfs/monitoring/prometheus.yml <<'EOF'
  - job_name: 'your-app'
    static_configs:
      - targets: ['your-app:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
EOF

# Reload Prometheus configuration
curl -X POST http://10.0.1.30:9090/-/reload
```

**Verification:**
```bash
# Check Prometheus targets
curl -s http://10.0.1.30:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job=="your-app")'

# Verify metrics are being collected
curl -s http://10.0.1.30:9090/api/v1/query?query=up{job="your-app"} | jq
```

### Step 13: Document Deployment

```bash
# Create deployment record
cat > /var/log/deployments/${APP_NAME}-${APP_VERSION}-$(date +%Y%m%d-%H%M%S).log <<EOF
Deployment Details
==================
Application: ${APP_NAME}
Version: ${APP_VERSION}
Date: $(date)
Deployed By: $(whoami)
Image: ${IMAGE_TAG}
Replicas: 3
Status: SUCCESS

Environment:
$(cat .env | grep -v PASSWORD)

Services:
$(docker stack services ${APP_NAME})
EOF
```

---

## Rollback Procedure

If the deployment fails or issues are discovered:

### Quick Rollback

```bash
# Remove the stack
docker stack rm ${APP_NAME}

# Wait for stack to be completely removed
while docker stack ps ${APP_NAME} 2>/dev/null | grep -q "${APP_NAME}"; do
  echo "Waiting for stack removal..."
  sleep 5
done

# Remove from load balancer
sudo rm /mnt/nfs/nginx/conf.d/${APP_NAME}.conf
docker service update --force hosting_nginx
```

**Verification:**
```bash
# Confirm stack removed
docker stack ls | grep ${APP_NAME} && echo "Stack still exists" || echo "Stack removed"

# Confirm services stopped
docker service ls | grep ${APP_NAME} && echo "Services still running" || echo "Services removed"
```

---

## Troubleshooting

### Issue: Image Build Fails

**Symptoms:**
- Docker build command returns error
- Build process hangs

**Resolution:**
```bash
# Check Docker daemon status
systemctl status docker

# Check disk space
df -h

# Clear build cache
docker builder prune -a

# Build with verbose output
docker build --progress=plain --no-cache .
```

### Issue: Image Push Fails

**Symptoms:**
- Push command returns authentication error
- Network timeout during push

**Resolution:**
```bash
# Re-authenticate to registry
docker logout ${DOCKER_REGISTRY}
docker login ${DOCKER_REGISTRY}

# Check registry is accessible
curl -v http://${DOCKER_REGISTRY}/v2/

# Check network connectivity
ping -c 3 ${DOCKER_REGISTRY}

# Try pushing with verbose output
docker push --log-level=debug ${IMAGE_TAG}
```

### Issue: Service Won't Start

**Symptoms:**
- Replicas stuck in "Preparing" or "Starting" state
- Service keeps restarting

**Resolution:**
```bash
# Check service tasks
docker service ps ${APP_NAME}_your-app --no-trunc

# View detailed logs
docker service logs ${APP_NAME}_your-app --tail 100

# Inspect service configuration
docker service inspect ${APP_NAME}_your-app --pretty

# Check node resources
docker node ls
docker node inspect swarm-worker-01 --pretty

# Verify image is pullable
docker pull ${IMAGE_TAG}

# Check health check configuration
docker service inspect ${APP_NAME}_your-app \
  --format '{{json .Spec.TaskTemplate.ContainerSpec.HealthCheck}}' | jq
```

### Issue: Health Checks Failing

**Symptoms:**
- Containers start but health checks fail
- Service shows unhealthy replicas

**Resolution:**
```bash
# Test health check manually
docker exec $(docker ps -q -f name=${APP_NAME}) curl -f http://localhost:3000/health

# Check application logs
docker service logs ${APP_NAME}_your-app --tail 50

# Verify environment variables
docker service inspect ${APP_NAME}_your-app \
  --format '{{json .Spec.TaskTemplate.ContainerSpec.Env}}' | jq

# Temporarily disable health check for debugging
docker service update \
  --health-cmd "exit 0" \
  ${APP_NAME}_your-app
```

### Issue: Cannot Connect to Database

**Symptoms:**
- Application logs show database connection errors
- Service crashes on startup

**Resolution:**
```bash
# Verify database service is running
docker service ps hosting_postgres

# Test database connectivity from app container
docker exec -it $(docker ps -q -f name=${APP_NAME}) \
  sh -c 'nc -zv postgres 5432'

# Check if app is on correct network
docker service inspect ${APP_NAME}_your-app \
  --format '{{json .Spec.TaskTemplate.Networks}}' | jq

# Verify database credentials
docker service inspect ${APP_NAME}_your-app \
  --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep DB_
```

### Issue: Insufficient Resources

**Symptoms:**
- Service won't scale to desired replicas
- Tasks failing with "no suitable node" message

**Resolution:**
```bash
# Check node resources
docker node ls
for node in $(docker node ls -q); do
  echo "=== Node: $(docker node inspect $node --format '{{.Description.Hostname}}') ==="
  docker node inspect $node --format '{{.Description.Resources}}'
done

# Check running containers resource usage
docker stats --no-stream

# Reduce resource reservations temporarily
docker service update \
  --reserve-cpu 0.25 \
  --reserve-memory 256M \
  ${APP_NAME}_your-app
```

---

## Post-Deployment Tasks

### 1. Monitoring Setup
```bash
# Create Grafana dashboard for new application
# Import dashboard JSON via Grafana UI at http://10.0.1.30:3001
```

### 2. Alerting Configuration
```bash
# Add alerting rules for the service
cat >> /mnt/nfs/monitoring/alert-rules.yml <<'EOF'
groups:
  - name: your-app
    interval: 30s
    rules:
      - alert: YourAppDown
        expr: up{job="your-app"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Your App is down"
EOF

# Reload Prometheus
curl -X POST http://10.0.1.30:9090/-/reload
```

### 3. Backup Configuration
```bash
# Add to backup script
echo "${APP_NAME}" >> /opt/scripts/backup-services.list
```

### 4. Documentation Update
```bash
# Update service inventory
cat >> /docs/service-inventory.md <<EOF
## ${APP_NAME}
- **Version:** ${APP_VERSION}
- **Replicas:** 3
- **Deployed:** $(date)
- **URL:** http://your-app.example.com
- **Health Check:** http://your-app:3000/health
EOF
```

---

## Validation Checklist

- [ ] Image built successfully
- [ ] Image scanned for vulnerabilities
- [ ] Image pushed to registry
- [ ] Stack deployed to swarm
- [ ] All replicas running
- [ ] Health checks passing
- [ ] Application accessible via load balancer
- [ ] Database connectivity verified
- [ ] Redis connectivity verified
- [ ] Monitoring configured
- [ ] Alerts configured
- [ ] Documentation updated
- [ ] Deployment logged

---

## Related Runbooks

- [02-release-new-version.md](./02-release-new-version.md) - For updating existing applications
- [03-scale-containers.md](./03-scale-containers.md) - For scaling the application
- [08-platform-restart.md](./08-platform-restart.md) - For platform-wide restarts

---

## References

- Docker Swarm Documentation: https://docs.docker.com/engine/swarm/
- Docker Compose Specification: https://docs.docker.com/compose/compose-file/
- Best Practices for Writing Dockerfiles: https://docs.docker.com/develop/develop-images/dockerfile_best-practices/
