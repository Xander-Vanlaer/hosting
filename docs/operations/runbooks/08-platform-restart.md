# Runbook: Platform Restart

**Document Version:** 1.0  
**Last Updated:** 2024-02  
**Estimated Time:** 30-60 minutes  
**Skill Level:** Advanced

## Overview

This runbook provides procedures for performing controlled restarts of the entire hosting platform or individual components. This includes graceful shutdowns, startup procedures, and verification steps to ensure system stability.

---

## Prerequisites

### Required Access
- SSH access to all swarm nodes (manager and workers)
- Root/sudo privileges on all nodes
- Access to monitoring systems
- Access to load balancer/DNS configuration

### Required Information
- Current system state
- Active services and their dependencies
- Reason for restart
- Expected downtime window

### Pre-Restart Checklist
- [ ] Restart reason documented
- [ ] Change window approved
- [ ] Stakeholders notified
- [ ] Backup completed
- [ ] Monitoring active
- [ ] Rollback plan prepared
- [ ] Team on standby

### Tools Required
```bash
# Verify tools are installed on manager node
docker --version
systemctl --version
```

---

## Restart Types

### Type 1: Service Restart
Individual service restart without platform downtime.
- **Use Case:** Service update, memory leak fix
- **Downtime:** None (rolling restart)
- **Risk:** Low

### Type 2: Infrastructure Restart
Restart infrastructure components (DB, cache, monitoring).
- **Use Case:** Configuration changes, performance issues
- **Downtime:** 5-15 minutes
- **Risk:** Medium

### Type 3: Full Platform Restart
Complete platform shutdown and restart.
- **Use Case:** Major updates, node maintenance
- **Downtime:** 15-30 minutes
- **Risk:** High

### Type 4: Emergency Restart
Quick restart during critical situations.
- **Use Case:** System hang, critical bug
- **Downtime:** Immediate
- **Risk:** High

---

## Procedure - Graceful Service Restart

### Step 1: Pre-Restart Verification

```bash
# SSH to swarm manager
ssh manager@10.0.1.10

# Set service to restart
export SERVICE_NAME="hosting_app"

# Check current service state
docker service ls | grep ${SERVICE_NAME}

# Get current replica count
CURRENT_REPLICAS=$(docker service ls --filter "name=${SERVICE_NAME}" \
  --format "{{.Replicas}}" | cut -d'/' -f1)

echo "Current replicas: ${CURRENT_REPLICAS}"

# Check service health
docker service ps ${SERVICE_NAME} --filter "desired-state=running"

# Document current state
docker service inspect ${SERVICE_NAME} > /tmp/${SERVICE_NAME}-state-$(date +%Y%m%d-%H%M%S).json
```

**Verification:**
```bash
# Verify service is stable before restart
docker service ps ${SERVICE_NAME} | grep -c Running

# Check for recent errors
docker service logs ${SERVICE_NAME} --since 5m | grep -i error | wc -l
```

### Step 2: Perform Rolling Restart

```bash
# Perform rolling restart (zero downtime)
docker service update --force ${SERVICE_NAME}

# Monitor restart progress
watch -n 2 'docker service ps '${SERVICE_NAME}' --format "table {{.ID}}\t{{.Name}}\t{{.Node}}\t{{.CurrentState}}"'

# In another terminal, monitor logs
docker service logs -f ${SERVICE_NAME} --tail 50
```

**Verification:**
```bash
# Wait for all replicas to be running
while true; do
  RUNNING=$(docker service ps ${SERVICE_NAME} \
    --filter "desired-state=running" \
    --format "{{.CurrentState}}" | grep Running | wc -l)
  
  echo "Running replicas: ${RUNNING}/${CURRENT_REPLICAS}"
  
  if [ ${RUNNING} -eq ${CURRENT_REPLICAS} ]; then
    echo "All replicas restarted successfully"
    break
  fi
  
  sleep 5
done

# Verify health
docker service ps ${SERVICE_NAME}

# Check for errors
docker service logs ${SERVICE_NAME} --since 5m | grep -i error
```

### Step 3: Verify Service Functionality

```bash
# Test service endpoints
curl -f http://localhost/health

# Check service is responding
for i in {1..10}; do
  curl -s http://localhost/health | jq '.status'
  sleep 1
done

# Verify load distribution
for i in {1..20}; do
  curl -s http://localhost/api/hostname
done | sort | uniq -c

# Check metrics
curl -s "http://10.0.1.30:9090/api/v1/query?query=up{job='${SERVICE_NAME}'}" | jq
```

**Verification:**
- All health checks passing
- Load distributed across replicas
- No error rate increase
- Response times normal

---

## Procedure - Infrastructure Restart

### Step 1: Enable Maintenance Mode

```bash
# Create maintenance page
cat > /tmp/maintenance.html <<'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>System Maintenance</title>
    <meta http-equiv="refresh" content="30">
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            background: rgba(255,255,255,0.95);
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            max-width: 600px;
            margin: 0 auto;
            color: #333;
        }
        h1 { color: #667eea; margin-bottom: 20px; }
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        p { line-height: 1.6; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔧 System Maintenance in Progress</h1>
        <div class="spinner"></div>
        <p>We're performing scheduled infrastructure maintenance.</p>
        <p>Expected completion: <strong>30 minutes</strong></p>
        <p>This page will automatically refresh.</p>
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

# Verify maintenance mode active
sleep 10
curl -I http://localhost/
```

### Step 2: Scale Down Application

```bash
# Scale application to 0
docker service scale hosting_app=0

# Wait for containers to stop
while [ $(docker ps -q -f name=hosting_app | wc -l) -gt 0 ]; do
  echo "Waiting for application containers to stop..."
  sleep 5
done

echo "Application stopped"
```

### Step 3: Restart Database

```bash
# Update PostgreSQL service (triggers restart)
docker service update --force hosting_postgres

# Monitor PostgreSQL restart
watch -n 3 'docker service ps hosting_postgres --filter "desired-state=running"'

# Wait for PostgreSQL to be ready
sleep 30

# Verify PostgreSQL is running
docker exec $(docker ps -q -f name=hosting_postgres) \
  pg_isready -U ${POSTGRES_USER}

# Test database connectivity
docker exec $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT 1;"

echo "PostgreSQL restarted successfully"
```

**Verification:**
```bash
# Check PostgreSQL health
docker service ps hosting_postgres

# Check logs for errors
docker logs $(docker ps -q -f name=hosting_postgres) --tail 50 | grep -i error

# Verify connections accepted
docker exec $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT count(*) FROM pg_stat_activity;"
```

### Step 4: Restart Redis

```bash
# Update Redis service
docker service update --force hosting_redis

# Monitor Redis restart
watch -n 3 'docker service ps hosting_redis --filter "desired-state=running"'

# Wait for Redis to be ready
sleep 20

# Verify Redis is running
docker exec $(docker ps -q -f name=hosting_redis) \
  redis-cli -a ${REDIS_PASSWORD} --no-auth-warning ping

# Check Redis info
docker exec $(docker ps -q -f name=hosting_redis) \
  redis-cli -a ${REDIS_PASSWORD} --no-auth-warning INFO server

echo "Redis restarted successfully"
```

**Verification:**
```bash
# Check Redis health
docker service ps hosting_redis

# Verify data persisted
docker exec $(docker ps -q -f name=hosting_redis) \
  redis-cli -a ${REDIS_PASSWORD} --no-auth-warning DBSIZE
```

### Step 5: Restart Monitoring Services

```bash
# Restart Prometheus
docker service update --force prometheus

# Wait for Prometheus to start
sleep 30

# Verify Prometheus
curl -f http://10.0.1.30:9090/-/healthy

# Restart Grafana
docker service update --force grafana

# Wait for Grafana to start
sleep 20

# Verify Grafana
curl -f http://10.0.1.30:3001/api/health

echo "Monitoring services restarted"
```

### Step 6: Restart Application

```bash
# Scale application back up
docker service scale hosting_app=${CURRENT_REPLICAS}

# Monitor application startup
watch -n 3 'docker service ps hosting_app --filter "desired-state=running"'

# Wait for all replicas to be running
while true; do
  RUNNING=$(docker service ps hosting_app \
    --filter "desired-state=running" \
    --format "{{.CurrentState}}" | grep Running | wc -l)
  
  echo "Running replicas: ${RUNNING}/${CURRENT_REPLICAS}"
  
  if [ ${RUNNING} -eq ${CURRENT_REPLICAS} ]; then
    break
  fi
  
  sleep 5
done

echo "Application restarted"
```

### Step 7: Disable Maintenance Mode

```bash
# Remove maintenance configuration
rm /mnt/nfs/nginx/conf.d/maintenance.conf

# Reload nginx
docker service update --force hosting_nginx

# Wait for nginx to reload
sleep 10

# Verify site is accessible
curl -I http://localhost/

echo "Maintenance mode disabled"
```

**Verification:**
```bash
# Test application
curl -f http://localhost/health

# Verify response code
curl -o /dev/null -s -w "%{http_code}\n" http://localhost/health

# Test database connectivity through app
curl -f http://localhost/api/db-check

# Test Redis connectivity through app
curl -f http://localhost/api/cache-check
```

---

## Procedure - Full Platform Restart

### Step 1: Pre-Restart Tasks

```bash
# Create comprehensive backup
/opt/scripts/backup-full.sh

# Wait for backup to complete
BACKUP_RESULT=$?
if [ ${BACKUP_RESULT} -ne 0 ]; then
  echo "Backup failed! Aborting restart."
  exit 1
fi

# Document current state
docker service ls > /tmp/services-before-restart.txt
docker node ls > /tmp/nodes-before-restart.txt
docker network ls > /tmp/networks-before-restart.txt
docker volume ls > /tmp/volumes-before-restart.txt

# Enable maintenance mode (as in Step 1 of Infrastructure Restart)
```

### Step 2: Graceful Service Shutdown

```bash
# Remove all stacks in order (application first, infrastructure last)
echo "Stopping application stack..."
docker service scale hosting_app=0

# Wait for graceful shutdown
sleep 60

# Stop remaining services
echo "Stopping all services..."
for service in $(docker service ls --format "{{.Name}}"); do
  echo "Stopping ${service}..."
  docker service rm ${service}
done

# Wait for all services to stop
sleep 30

# Verify all services stopped
docker service ls

echo "All services stopped"
```

**Verification:**
```bash
# Verify no running services
[ $(docker service ls -q | wc -l) -eq 0 ] && echo "All services stopped" || echo "Some services still running"

# Verify no running containers
docker ps

# Check for any stuck containers
docker ps -a | grep -v "Exited"
```

### Step 3: Restart Docker on All Nodes

```bash
# On manager node
sudo systemctl restart docker

# Wait for Docker to restart
sleep 30

# Verify Docker is running
sudo systemctl status docker

# On each worker node
for worker in swarm-worker-01 swarm-worker-02; do
  echo "Restarting Docker on ${worker}..."
  ssh ${worker} "sudo systemctl restart docker"
  sleep 10
done

# Verify swarm cluster
docker node ls

# Wait for all nodes to be ready
while [ $(docker node ls --filter "status=ready" | wc -l) -lt 3 ]; do
  echo "Waiting for all nodes to be ready..."
  sleep 5
done

echo "All nodes ready"
```

**Verification:**
```bash
# Check swarm status
docker info | grep -A 10 "Swarm:"

# Verify all nodes are active
docker node ls

# Check for any node errors
for node in $(docker node ls -q); do
  docker node inspect $node --format '{{.Status.State}}: {{.Spec.Availability}}'
done
```

### Step 4: Restore Network Configuration

```bash
# Networks are typically recreated by stack deployment
# Verify overlay network driver is available
docker network ls --filter driver=overlay

# If networks need manual recreation (rare)
# docker network create --driver overlay --attachable frontend
# docker network create --driver overlay --attachable backend
# etc.
```

### Step 5: Deploy Infrastructure Stack

```bash
# Deploy database and cache first
cd /opt/docker-compose/hosting

# Deploy infrastructure
docker stack deploy \
  --compose-file docker-compose.prod.yml \
  hosting

# Monitor deployment
watch -n 5 'docker service ls'

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
sleep 60

while ! docker exec $(docker ps -q -f name=hosting_postgres) \
  pg_isready -U ${POSTGRES_USER} 2>/dev/null; do
  echo "PostgreSQL not ready yet..."
  sleep 10
done

echo "PostgreSQL is ready"

# Wait for Redis to be ready
echo "Waiting for Redis..."
sleep 30

while ! docker exec $(docker ps -q -f name=hosting_redis) \
  redis-cli -a ${REDIS_PASSWORD} --no-auth-warning ping 2>/dev/null; do
  echo "Redis not ready yet..."
  sleep 10
done

echo "Redis is ready"
```

**Verification:**
```bash
# Check infrastructure services
docker service ls | grep -E "postgres|redis|prometheus|grafana|nginx"

# Verify all services are running
docker service ps hosting_postgres
docker service ps hosting_redis
docker service ps prometheus
docker service ps grafana
docker service ps hosting_nginx
```

### Step 6: Verify Data Persistence

```bash
# Verify PostgreSQL data
docker exec $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;
EOF

# Verify Redis data
docker exec $(docker ps -q -f name=hosting_redis) \
  redis-cli -a ${REDIS_PASSWORD} --no-auth-warning DBSIZE

# Verify volumes
docker volume ls

echo "Data verification complete"
```

### Step 7: Scale Application Services

```bash
# Start application with reduced replicas initially
docker service scale hosting_app=2

# Wait for first replicas to be healthy
sleep 60

# Verify health
docker service ps hosting_app

# Scale to full capacity
docker service scale hosting_app=${CURRENT_REPLICAS}

# Monitor scaling
watch -n 3 'docker service ps hosting_app --filter "desired-state=running"'
```

### Step 8: Perform Post-Restart Verification

```bash
# Comprehensive system check
echo "=== Post-Restart Verification ==="

# 1. Check all services are running
echo "1. Service Status:"
docker service ls

# 2. Check service health
echo "2. Service Health:"
for service in $(docker service ls --format "{{.Name}}"); do
  REPLICAS=$(docker service ls --filter "name=${service}" --format "{{.Replicas}}")
  echo "  ${service}: ${REPLICAS}"
done

# 3. Test database connectivity
echo "3. Database Connectivity:"
docker exec $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT 1;" && \
  echo "  ✓ PostgreSQL OK" || echo "  ✗ PostgreSQL FAILED"

# 4. Test Redis connectivity
echo "4. Redis Connectivity:"
docker exec $(docker ps -q -f name=hosting_redis) \
  redis-cli -a ${REDIS_PASSWORD} --no-auth-warning ping && \
  echo "  ✓ Redis OK" || echo "  ✗ Redis FAILED"

# 5. Test application endpoints
echo "5. Application Endpoints:"
curl -f http://localhost/health && echo "  ✓ Health OK" || echo "  ✗ Health FAILED"
curl -f http://localhost/api/version && echo "  ✓ API OK" || echo "  ✗ API FAILED"

# 6. Check monitoring
echo "6. Monitoring Systems:"
curl -f http://10.0.1.30:9090/-/healthy && echo "  ✓ Prometheus OK" || echo "  ✗ Prometheus FAILED"
curl -f http://10.0.1.30:3001/api/health && echo "  ✓ Grafana OK" || echo "  ✗ Grafana FAILED"

# 7. Check for errors in logs
echo "7. Recent Errors:"
for service in hosting_app hosting_postgres hosting_redis hosting_nginx; do
  ERROR_COUNT=$(docker service logs ${service} --since 10m 2>/dev/null | grep -i error | wc -l)
  echo "  ${service}: ${ERROR_COUNT} errors"
done

# 8. Check resource usage
echo "8. Resource Usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"

echo "=== Verification Complete ==="
```

### Step 9: Disable Maintenance Mode

```bash
# Remove maintenance mode (as in Infrastructure Restart Step 7)
rm /mnt/nfs/nginx/conf.d/maintenance.conf
docker service update --force hosting_nginx

# Verify site accessible
curl -I http://localhost/
```

### Step 10: Monitor for Stability

```bash
# Monitor for 30 minutes
for i in {1..30}; do
  echo "=== Minute ${i} ==="
  
  # Check service status
  docker service ls --format "table {{.Name}}\t{{.Replicas}}"
  
  # Check for errors
  docker service logs hosting_app --since 1m | grep -i error | wc -l
  
  # Check response times
  curl -w "Response: %{http_code}, Time: %{time_total}s\n" -o /dev/null -s http://localhost/health
  
  sleep 60
done

echo "Monitoring complete"
```

### Step 11: Document Restart

```bash
# Create restart record
cat >> /var/log/platform-restarts.log <<EOF
========================================
Platform Restart Completed
========================================
Date: $(date)
Type: Full Platform Restart
Reason: [specify reason]
Performed By: $(whoami)
Status: SUCCESS

Timeline:
  Shutdown Start: [time]
  Services Stopped: [time]
  Docker Restarted: [time]
  Services Started: [time]
  Verification Complete: [time]
  Maintenance Ended: $(date)
  
Total Downtime: [calculated duration]

Services Restarted:
$(docker service ls)

Verification Results:
  ✓ All services running
  ✓ Database accessible
  ✓ Cache accessible
  ✓ Application responding
  ✓ Monitoring operational
  ✓ No critical errors

Notes:
- Platform restart completed successfully
- All verification checks passed
- System stable after 30 minutes

========================================

EOF

cat /var/log/platform-restarts.log | tail -40
```

---

## Emergency Restart Procedure

For critical situations requiring immediate restart:

```bash
# 1. Quick service restart
docker service update --force hosting_app

# 2. If unresponsive, force restart
docker service rm hosting_app
sleep 10
docker stack deploy --compose-file docker-compose.prod.yml hosting

# 3. If entire platform hung
sudo systemctl restart docker

# Wait and verify
sleep 60
docker node ls
docker service ls

# 4. Redeploy if needed
docker stack deploy --compose-file docker-compose.prod.yml hosting
```

---

## Rollback Procedure

If restart causes issues:

```bash
# 1. Enable maintenance mode immediately
# (Use Step 1 from Infrastructure Restart)

# 2. Restore from pre-restart backup
LATEST_BACKUP=$(ls -td /mnt/nfs/backups/20* | head -1)
/opt/scripts/restore-from-backup.sh ${LATEST_BACKUP}

# 3. Verify restore
curl -f http://localhost/health

# 4. If successful, disable maintenance mode
rm /mnt/nfs/nginx/conf.d/maintenance.conf
docker service update --force hosting_nginx
```

---

## Troubleshooting

### Issue: Service Won't Start After Restart

**Resolution:**
```bash
# Check service logs
docker service logs ${SERVICE_NAME} --tail 100

# Check service configuration
docker service inspect ${SERVICE_NAME} --pretty

# Verify networks exist
docker network ls

# Verify volumes exist
docker volume ls

# Try manual container start for debugging
docker run -it --rm ${IMAGE_NAME} sh
```

### Issue: Database Won't Accept Connections

**Resolution:**
```bash
# Check PostgreSQL logs
docker logs $(docker ps -q -f name=hosting_postgres) --tail 100

# Verify PostgreSQL is running
docker exec $(docker ps -q -f name=hosting_postgres) pg_isready

# Check pg_hba.conf if needed
docker exec $(docker ps -q -f name=hosting_postgres) cat /var/lib/postgresql/data/pg_hba.conf

# Restart PostgreSQL container
docker service update --force hosting_postgres
```

### Issue: Swarm Cluster Unstable

**Resolution:**
```bash
# Check swarm status on manager
docker info | grep -A 10 Swarm

# Check node status
docker node ls

# If nodes show as down, try rejoining
# On worker nodes:
docker swarm leave
# On manager:
TOKEN=$(docker swarm join-token worker -q)
# On worker:
docker swarm join --token ${TOKEN} 10.0.1.10:2377
```

---

## Validation Checklist

- [ ] Backup completed before restart
- [ ] Maintenance mode enabled
- [ ] Services stopped gracefully
- [ ] Docker daemon restarted (if full restart)
- [ ] Swarm cluster healthy
- [ ] Networks recreated
- [ ] Volumes intact
- [ ] Infrastructure services running
- [ ] Database accessible
- [ ] Cache accessible
- [ ] Application services scaled up
- [ ] All replicas healthy
- [ ] Endpoints responding
- [ ] No critical errors in logs
- [ ] Monitoring operational
- [ ] Maintenance mode disabled
- [ ] Restart documented

---

## Related Runbooks

- [02-release-new-version.md](./02-release-new-version.md) - For application updates
- [03-scale-containers.md](./03-scale-containers.md) - For scaling operations
- [06-restore-procedures.md](./06-restore-procedures.md) - For restore operations

---

## References

- Docker Service Update: https://docs.docker.com/engine/reference/commandline/service_update/
- Docker Stack Deploy: https://docs.docker.com/engine/reference/commandline/stack_deploy/
- Swarm Administration: https://docs.docker.com/engine/swarm/admin_guide/
