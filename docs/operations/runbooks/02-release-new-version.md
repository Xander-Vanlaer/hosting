# Runbook: Release New Version

**Document Version:** 1.0  
**Last Updated:** 2024-02  
**Estimated Time:** 15-30 minutes  
**Skill Level:** Intermediate

## Overview

This runbook describes the procedure for performing a rolling update to deploy a new version of an existing application in the Docker Swarm cluster. The rolling update strategy minimizes downtime by updating containers gradually.

---

## Prerequisites

### Required Access
- SSH access to swarm manager node (10.0.1.10)
- Docker registry credentials
- Git repository access

### Required Information
- Application name (existing service)
- Current version running
- New version to deploy
- Rollback plan if update fails

### Pre-Deployment Checklist
- [ ] New version tested in staging environment
- [ ] Database migrations prepared (if any)
- [ ] Environment variable changes documented
- [ ] Rollback plan documented
- [ ] Backup of current state completed
- [ ] Change window scheduled
- [ ] Stakeholders notified

### Tools Required
```bash
# Verify tools are installed
docker --version
git --version
jq --version || sudo apt-get install -y jq
```

---

## Procedure

### Step 1: Pre-Deployment Verification

```bash
# SSH to swarm manager
ssh manager@10.0.1.10

# Set variables
export SERVICE_NAME="hosting_app"
export CURRENT_VERSION="1.0.0"
export NEW_VERSION="1.1.0"
export DOCKER_REGISTRY="localhost:5000"

# Verify current service state
docker service ls | grep ${SERVICE_NAME}

# Check current image version
docker service inspect ${SERVICE_NAME} \
  --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'

# Count running replicas
docker service ps ${SERVICE_NAME} \
  --filter "desired-state=running" \
  --format "{{.ID}}" | wc -l

# Save current configuration
docker service inspect ${SERVICE_NAME} > /tmp/${SERVICE_NAME}-backup-$(date +%Y%m%d-%H%M%S).json
```

**Verification:**
```bash
# Confirm service is healthy
docker service ps ${SERVICE_NAME} --filter "desired-state=running" | grep Running

# Check current health
docker service inspect ${SERVICE_NAME} \
  --format '{{range .Endpoint.VirtualIPs}}{{.Addr}}{{end}}'

# Verify all replicas healthy
REPLICAS=$(docker service ls --filter "name=${SERVICE_NAME}" --format "{{.Replicas}}")
echo "Current replicas: ${REPLICAS}"
```

### Step 2: Verify New Image Exists

```bash
# Pull new image to manager node
docker pull ${DOCKER_REGISTRY}/hosting-app:${NEW_VERSION}

# Verify image
docker images | grep hosting-app | grep ${NEW_VERSION}

# Check image details
docker inspect ${DOCKER_REGISTRY}/hosting-app:${NEW_VERSION}

# Compare image sizes
echo "Current version:"
docker images ${DOCKER_REGISTRY}/hosting-app:${CURRENT_VERSION} --format "{{.Size}}"
echo "New version:"
docker images ${DOCKER_REGISTRY}/hosting-app:${NEW_VERSION} --format "{{.Size}}"
```

**Verification:**
```bash
# Verify image has required labels
docker inspect ${DOCKER_REGISTRY}/hosting-app:${NEW_VERSION} \
  --format='{{json .Config.Labels}}' | jq

# Check image creation date
docker inspect ${DOCKER_REGISTRY}/hosting-app:${NEW_VERSION} \
  --format='{{.Created}}'
```

### Step 3: Run Pre-Deployment Database Migrations (if required)

```bash
# Check if migrations are needed
ls -la /opt/applications/hosting-app/migrations/

# Run migrations in a one-off container
docker run --rm \
  --network hosting_database \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=${POSTGRES_DB} \
  -e DB_USER=${POSTGRES_USER} \
  -e DB_PASSWORD=${POSTGRES_PASSWORD} \
  ${DOCKER_REGISTRY}/hosting-app:${NEW_VERSION} \
  npm run migrate

# Alternative: Use dedicated migration service
docker service create \
  --name ${SERVICE_NAME}_migration \
  --network hosting_database \
  --env DB_HOST=postgres \
  --env DB_PASSWORD=${POSTGRES_PASSWORD} \
  --restart-condition none \
  ${DOCKER_REGISTRY}/hosting-app:${NEW_VERSION} \
  npm run migrate

# Wait for migration to complete
docker service ps ${SERVICE_NAME}_migration

# Check migration logs
docker service logs ${SERVICE_NAME}_migration
```

**Verification:**
```bash
# Verify database schema version
docker exec -it $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 5;"

# Clean up migration service
docker service rm ${SERVICE_NAME}_migration 2>/dev/null || true
```

### Step 4: Configure Rolling Update Strategy

```bash
# Review current update configuration
docker service inspect ${SERVICE_NAME} \
  --format='{{json .Spec.UpdateConfig}}' | jq

# Set update strategy (if not already configured)
docker service update \
  --update-parallelism 2 \
  --update-delay 10s \
  --update-failure-action rollback \
  --update-monitor 30s \
  --update-max-failure-ratio 0.2 \
  ${SERVICE_NAME}

# Verify update configuration
docker service inspect ${SERVICE_NAME} \
  --format='{{json .Spec.UpdateConfig}}' | jq
```

**Configuration Explanation:**
- `--update-parallelism 2`: Update 2 containers at a time
- `--update-delay 10s`: Wait 10 seconds between batches
- `--update-failure-action rollback`: Auto-rollback on failure
- `--update-monitor 30s`: Monitor for 30s after each batch
- `--update-max-failure-ratio 0.2`: Rollback if >20% fail

### Step 5: Initiate Rolling Update

```bash
# Start the rolling update
docker service update \
  --image ${DOCKER_REGISTRY}/hosting-app:${NEW_VERSION} \
  --with-registry-auth \
  ${SERVICE_NAME}

# Note the update start time
echo "Update started at: $(date)"
```

**Verification:**
```bash
# Verify update started
docker service inspect ${SERVICE_NAME} \
  --format='{{.UpdateStatus.State}}'

# Should show: "updating"
```

### Step 6: Monitor Rolling Update Progress

```bash
# Watch update progress in real-time
watch -n 2 'docker service ps '${SERVICE_NAME}' --format "table {{.ID}}\t{{.Name}}\t{{.Image}}\t{{.CurrentState}}\t{{.Error}}"'

# In another terminal, monitor logs
docker service logs -f ${SERVICE_NAME} --tail 50

# Check update status
docker service inspect ${SERVICE_NAME} \
  --format='Update Status: {{.UpdateStatus.State}} - Started: {{.UpdateStatus.StartedAt}}'
```

**Monitor for:**
- Old containers shutting down gracefully
- New containers starting successfully
- Health checks passing on new containers
- No error messages in logs
- Update status progressing

### Step 7: Monitor Service Health During Update

```bash
# Check service endpoint availability
while true; do
  echo "$(date): Health check..."
  curl -f -s http://localhost/health && echo " OK" || echo " FAILED"
  sleep 5
done

# Monitor replica count
watch -n 3 'docker service ps '${SERVICE_NAME}' --filter "desired-state=running" | grep Running | wc -l'

# Check for failed tasks
docker service ps ${SERVICE_NAME} --filter "desired-state=shutdown" | grep Failed
```

**Success Indicators:**
- No failed health checks
- Replica count remains stable
- No "Failed" states in task list
- Response times remain normal

### Step 8: Verify Update Completion

```bash
# Check final update status
docker service inspect ${SERVICE_NAME} \
  --format='{{.UpdateStatus.State}}'

# Should show: "completed"

# Verify all replicas running new version
docker service ps ${SERVICE_NAME} \
  --filter "desired-state=running" \
  --format "{{.Name}}\t{{.Image}}\t{{.CurrentState}}"

# Count replicas on new version
docker service ps ${SERVICE_NAME} \
  --filter "desired-state=running" \
  --format "{{.Image}}" | grep ${NEW_VERSION} | wc -l
```

**Verification:**
```bash
# Get expected replica count
EXPECTED=$(docker service inspect ${SERVICE_NAME} \
  --format='{{.Spec.Mode.Replicated.Replicas}}')

# Get actual running count on new version
ACTUAL=$(docker service ps ${SERVICE_NAME} \
  --filter "desired-state=running" \
  --format "{{.Image}}" | grep ${NEW_VERSION} | wc -l)

echo "Expected: ${EXPECTED}, Actual: ${ACTUAL}"

# Verify they match
[ "${EXPECTED}" -eq "${ACTUAL}" ] && echo "✓ All replicas updated" || echo "✗ Replica count mismatch"
```

### Step 9: Post-Update Verification

```bash
# Test application endpoints
curl -f http://localhost/health
curl -f http://localhost/api/version

# Check application version in response
curl -s http://localhost/api/version | jq -r '.version'

# Verify database connectivity
docker exec $(docker ps -q -f name=${SERVICE_NAME} | head -1) \
  sh -c 'node -e "require(\"./db\").testConnection()"' 2>/dev/null || \
  echo "Database connectivity test"

# Verify Redis connectivity
docker exec $(docker ps -q -f name=${SERVICE_NAME} | head -1) \
  sh -c 'redis-cli -h redis -a ${REDIS_PASSWORD} ping'

# Check error rates in logs
docker service logs ${SERVICE_NAME} --since 5m | grep -i error | wc -l
```

**Verification:**
- Health endpoint returns 200 OK
- Version endpoint returns new version
- Database connectivity confirmed
- Redis connectivity confirmed
- No increase in error rates

### Step 10: Performance Validation

```bash
# Check response times
for i in {1..10}; do
  curl -w "Response time: %{time_total}s\n" -o /dev/null -s http://localhost/health
  sleep 1
done

# Check container resource usage
docker stats --no-stream $(docker ps -q -f name=${SERVICE_NAME})

# Monitor for memory leaks
docker stats --format "table {{.Container}}\t{{.MemUsage}}" \
  $(docker ps -q -f name=${SERVICE_NAME})

# Check Prometheus metrics
curl -s http://10.0.1.30:9090/api/v1/query?query='rate(http_requests_total{job="'${SERVICE_NAME}'"}[5m])' | jq
```

**Verification:**
- Response times within acceptable range (< 200ms for health check)
- Memory usage stable
- CPU usage normal
- No error rate spikes

### Step 11: Clean Up Old Tasks

```bash
# View shutdown tasks
docker service ps ${SERVICE_NAME} --filter "desired-state=shutdown"

# Old tasks are automatically cleaned up by Docker
# But you can verify cleanup is happening
docker service inspect ${SERVICE_NAME} \
  --format='{{.Spec.TaskTemplate.ForceUpdate}}'

# Check for any stuck tasks
docker service ps ${SERVICE_NAME} | grep -E "Failed|Rejected"
```

**Verification:**
```bash
# Verify only running tasks exist after cleanup period (5 minutes)
sleep 300
docker service ps ${SERVICE_NAME} --filter "desired-state=shutdown" | tail -n +2 | wc -l
```

### Step 12: Update Documentation

```bash
# Log the deployment
cat >> /var/log/deployments/release-log.txt <<EOF
========================================
Release: ${SERVICE_NAME} ${NEW_VERSION}
Date: $(date)
By: $(whoami)
Previous Version: ${CURRENT_VERSION}
Status: SUCCESS
Update Duration: [start_time] - $(date)
========================================

Replicas Updated: ${EXPECTED}
Update Strategy: Rolling (parallelism: 2, delay: 10s)
Rollbacks: 0

Notes:
- All replicas updated successfully
- Health checks passing
- Performance metrics normal

EOF

# Update version in inventory
sed -i "s/${CURRENT_VERSION}/${NEW_VERSION}/g" /docs/service-inventory.md

# Tag the release
git tag -a "production-${SERVICE_NAME}-${NEW_VERSION}" -m "Production release ${NEW_VERSION}"
git push origin --tags
```

---

## Rollback Procedure

### Automatic Rollback

If the update fails, Docker Swarm will automatically rollback based on the failure action configuration:

```bash
# Monitor rollback progress
docker service ps ${SERVICE_NAME} --format "table {{.ID}}\t{{.Name}}\t{{.Image}}\t{{.CurrentState}}"

# Check rollback status
docker service inspect ${SERVICE_NAME} \
  --format='Rollback Status: {{.UpdateStatus.State}}'
```

### Manual Rollback

If you need to manually rollback:

```bash
# Initiate manual rollback to previous version
docker service rollback ${SERVICE_NAME}

# Monitor rollback
watch -n 2 'docker service ps '${SERVICE_NAME}

# Verify rollback completed
docker service inspect ${SERVICE_NAME} \
  --format='{{.Spec.TaskTemplate.ContainerSpec.Image}}'

# Should show previous version
```

### Rollback to Specific Version

```bash
# Rollback to specific version
docker service update \
  --image ${DOCKER_REGISTRY}/hosting-app:${CURRENT_VERSION} \
  --with-registry-auth \
  ${SERVICE_NAME}

# Wait for rollback to complete
while [ "$(docker service inspect ${SERVICE_NAME} --format='{{.UpdateStatus.State}}')" != "completed" ]; do
  echo "Waiting for rollback to complete..."
  sleep 5
done

echo "Rollback completed"
```

### Verify Rollback

```bash
# Verify service running on old version
docker service ps ${SERVICE_NAME} \
  --filter "desired-state=running" \
  --format "{{.Image}}"

# Test application
curl -f http://localhost/health
curl -s http://localhost/api/version | jq -r '.version'

# Check logs for errors
docker service logs ${SERVICE_NAME} --since 5m | grep -i error
```

### Rollback Database Migrations

```bash
# If database migrations were applied, rollback
docker run --rm \
  --network hosting_database \
  -e DB_HOST=postgres \
  -e DB_PASSWORD=${POSTGRES_PASSWORD} \
  ${DOCKER_REGISTRY}/hosting-app:${CURRENT_VERSION} \
  npm run migrate:rollback

# Verify database schema version
docker exec -it $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;"
```

---

## Troubleshooting

### Issue: Update Stuck at "Updating"

**Symptoms:**
- Update status shows "updating" for extended period
- No new containers starting

**Resolution:**
```bash
# Check service tasks
docker service ps ${SERVICE_NAME} --no-trunc

# Check for specific errors
docker service ps ${SERVICE_NAME} | grep -E "Failed|Rejected"

# View detailed task logs
docker inspect $(docker ps -aq -f name=${SERVICE_NAME}) --format='{{.State.Status}}'

# Check if image can be pulled
docker pull ${DOCKER_REGISTRY}/hosting-app:${NEW_VERSION}

# Verify registry authentication
docker login ${DOCKER_REGISTRY}

# If stuck, initiate rollback
docker service rollback ${SERVICE_NAME}
```

### Issue: New Containers Failing Health Checks

**Symptoms:**
- New containers start but health checks fail
- Continuous restart loop

**Resolution:**
```bash
# Check health check configuration
docker service inspect ${SERVICE_NAME} \
  --format='{{json .Spec.TaskTemplate.ContainerSpec.HealthCheck}}' | jq

# Test health check manually in container
docker exec $(docker ps -q -f name=${SERVICE_NAME} | head -1) \
  curl -f http://localhost:3000/health

# Check application logs
docker service logs ${SERVICE_NAME} --tail 100 | grep -i error

# Verify environment variables
docker service inspect ${SERVICE_NAME} \
  --format='{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}'

# Increase health check timeout if needed
docker service update \
  --health-timeout 10s \
  --health-retries 5 \
  ${SERVICE_NAME}
```

### Issue: Update Triggered Automatic Rollback

**Symptoms:**
- Update automatically rolled back
- UpdateStatus shows "rollback_completed"

**Resolution:**
```bash
# Check why rollback occurred
docker service inspect ${SERVICE_NAME} \
  --format='{{json .UpdateStatus}}' | jq

# View failed task errors
docker service ps ${SERVICE_NAME} --filter "desired-state=shutdown" | grep Failed

# Get task error messages
for task in $(docker service ps ${SERVICE_NAME} -q --filter "desired-state=shutdown"); do
  docker inspect $task --format='{{.Status.Err}}'
done

# Review update configuration
docker service inspect ${SERVICE_NAME} \
  --format='{{json .Spec.UpdateConfig}}' | jq

# Address underlying issue and retry update
docker service update \
  --image ${DOCKER_REGISTRY}/hosting-app:${NEW_VERSION} \
  ${SERVICE_NAME}
```

### Issue: Service Degraded During Update

**Symptoms:**
- Increased response times
- Some requests failing
- Service partially unavailable

**Resolution:**
```bash
# Slow down the update
docker service update \
  --update-parallelism 1 \
  --update-delay 30s \
  ${SERVICE_NAME}

# Check load balancer
docker service ps hosting_nginx

# Check resource constraints
docker stats --no-stream

# Temporarily scale up during update
CURRENT_REPLICAS=$(docker service ls --filter "name=${SERVICE_NAME}" --format "{{.Replicas}}" | cut -d'/' -f1)
docker service scale ${SERVICE_NAME}=$((CURRENT_REPLICAS + 2))

# Complete update, then scale back down
docker service scale ${SERVICE_NAME}=${CURRENT_REPLICAS}
```

### Issue: Database Connection Errors After Update

**Symptoms:**
- New version cannot connect to database
- Connection timeout errors

**Resolution:**
```bash
# Verify database is running
docker service ps hosting_postgres

# Check database connectivity from new container
docker exec $(docker ps -q -f name=${SERVICE_NAME} | head -1) \
  nc -zv postgres 5432

# Verify network attachment
docker service inspect ${SERVICE_NAME} \
  --format='{{json .Spec.TaskTemplate.Networks}}' | jq

# Check database credentials
docker service inspect ${SERVICE_NAME} \
  --format='{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep DB_

# Test database connection manually
docker exec $(docker ps -q -f name=${SERVICE_NAME} | head -1) \
  psql -h postgres -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT 1"
```

### Issue: Memory Leak After Update

**Symptoms:**
- Memory usage continuously increasing
- Containers being killed by OOM

**Resolution:**
```bash
# Monitor memory usage over time
watch -n 5 'docker stats --no-stream $(docker ps -q -f name='${SERVICE_NAME}') --format "table {{.Container}}\t{{.MemUsage}}\t{{.MemPerc}}"'

# Check for memory leaks in application
docker exec $(docker ps -q -f name=${SERVICE_NAME} | head -1) \
  node -e 'console.log(process.memoryUsage())'

# Increase memory limits temporarily
docker service update \
  --limit-memory 3G \
  ${SERVICE_NAME}

# If leak confirmed, rollback immediately
docker service rollback ${SERVICE_NAME}

# Investigate and fix memory leak before next deployment
```

---

## Post-Deployment Monitoring

### First Hour

```bash
# Monitor error rates
watch -n 60 'docker service logs '${SERVICE_NAME}' --since 1m | grep -i error | wc -l'

# Monitor response times
watch -n 60 'curl -w "Response time: %{time_total}s\n" -o /dev/null -s http://localhost/health'

# Monitor resource usage
watch -n 60 'docker stats --no-stream $(docker ps -q -f name='${SERVICE_NAME}')'
```

### First Day

```bash
# Check Grafana dashboard
# Access: http://10.0.1.30:3001

# Review Prometheus alerts
curl -s http://10.0.1.30:9090/api/v1/alerts | jq '.data.alerts[] | select(.labels.job=="'${SERVICE_NAME}'")'

# Analyze logs for patterns
docker service logs ${SERVICE_NAME} --since 24h | grep -i error | sort | uniq -c | sort -rn
```

---

## Validation Checklist

- [ ] New version image verified in registry
- [ ] Database migrations executed successfully
- [ ] Update strategy configured
- [ ] Rolling update completed
- [ ] All replicas updated to new version
- [ ] Health checks passing
- [ ] Application endpoints responding
- [ ] Database connectivity verified
- [ ] Redis connectivity verified
- [ ] Performance metrics normal
- [ ] No error rate increase
- [ ] Old tasks cleaned up
- [ ] Documentation updated
- [ ] Deployment logged
- [ ] Monitoring confirmed

---

## Related Runbooks

- [01-deploy-new-application.md](./01-deploy-new-application.md) - For new application deployments
- [03-scale-containers.md](./03-scale-containers.md) - For scaling services
- [04-database-migration.md](./04-database-migration.md) - For complex database migrations

---

## References

- Docker Service Update: https://docs.docker.com/engine/reference/commandline/service_update/
- Docker Service Rollback: https://docs.docker.com/engine/reference/commandline/service_rollback/
- Rolling Updates: https://docs.docker.com/engine/swarm/swarm-tutorial/rolling-update/
