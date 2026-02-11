# Runbook: Scale Containers

**Document Version:** 1.0  
**Last Updated:** 2024-02  
**Estimated Time:** 10-20 minutes  
**Skill Level:** Intermediate

## Overview

This runbook provides procedures for horizontally scaling containerized services in the Docker Swarm cluster. This includes scaling up to handle increased load and scaling down to optimize resource usage.

---

## Prerequisites

### Required Access
- SSH access to swarm manager node (10.0.1.10)
- Sufficient permissions to update services

### Required Information
- Service name to scale
- Current replica count
- Target replica count
- Available cluster resources

### Pre-Scaling Checklist
- [ ] Current service state documented
- [ ] Resource availability verified
- [ ] Load metrics reviewed
- [ ] Scaling strategy determined
- [ ] Rollback plan prepared

### Tools Required
```bash
# Verify tools are installed
docker --version
jq --version || sudo apt-get install -y jq
```

---

## Scaling Decision Matrix

| Metric | Scale Up Threshold | Scale Down Threshold |
|--------|-------------------|---------------------|
| CPU Usage | > 70% average | < 30% average |
| Memory Usage | > 80% average | < 40% average |
| Request Rate | > 80% capacity | < 40% capacity |
| Response Time | > 500ms p95 | < 100ms p95 |
| Queue Depth | > 100 messages | < 10 messages |

---

## Procedure

### Step 1: Assess Current State

```bash
# SSH to swarm manager
ssh manager@10.0.1.10

# Set service name
export SERVICE_NAME="hosting_app"

# Check current service state
docker service ls | grep ${SERVICE_NAME}

# Get current replica count
CURRENT_REPLICAS=$(docker service ls --filter "name=${SERVICE_NAME}" \
  --format "{{.Replicas}}" | cut -d'/' -f1)

echo "Current replicas: ${CURRENT_REPLICAS}"

# View replica distribution across nodes
docker service ps ${SERVICE_NAME} \
  --filter "desired-state=running" \
  --format "table {{.Name}}\t{{.Node}}\t{{.CurrentState}}"

# Check service resource configuration
docker service inspect ${SERVICE_NAME} \
  --format='{{json .Spec.TaskTemplate.Resources}}' | jq
```

**Verification:**
```bash
# Verify all current replicas are healthy
docker service ps ${SERVICE_NAME} \
  --filter "desired-state=running" | grep Running

# Count healthy replicas
HEALTHY_REPLICAS=$(docker service ps ${SERVICE_NAME} \
  --filter "desired-state=running" \
  --format "{{.CurrentState}}" | grep Running | wc -l)

echo "Healthy replicas: ${HEALTHY_REPLICAS}/${CURRENT_REPLICAS}"
```

### Step 2: Check Resource Availability

```bash
# Check cluster resources
docker node ls

# Check each node's available resources
for node in $(docker node ls -q); do
  echo "=== Node: $(docker node inspect $node --format '{{.Description.Hostname}}') ==="
  docker node inspect $node --format 'Resources: {{json .Description.Resources}}' | jq
  docker node inspect $node --format 'Status: {{.Status.State}} - Availability: {{.Spec.Availability}}'
  echo ""
done

# Check current resource usage across cluster
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"

# Calculate available capacity
echo "=== Cluster Capacity Summary ==="
docker node ls --format "table {{.Hostname}}\t{{.Status}}\t{{.Availability}}"
```

**Verification:**
```bash
# Verify nodes are ready
ACTIVE_NODES=$(docker node ls --filter "role=worker" --format "{{.Status}}" | grep Ready | wc -l)
echo "Active worker nodes: ${ACTIVE_NODES}"

# Check for node constraints
docker service inspect ${SERVICE_NAME} \
  --format='{{json .Spec.TaskTemplate.Placement}}' | jq
```

### Step 3: Review Current Performance Metrics

```bash
# Check service metrics from Prometheus
curl -s "http://10.0.1.30:9090/api/v1/query?query=avg(rate(container_cpu_usage_seconds_total{service=\"${SERVICE_NAME}\"}[5m]))" | jq '.data.result[0].value[1]'

# Check memory usage
curl -s "http://10.0.1.30:9090/api/v1/query?query=avg(container_memory_usage_bytes{service=\"${SERVICE_NAME}\"})" | jq '.data.result[0].value[1]'

# Check request rate
curl -s "http://10.0.1.30:9090/api/v1/query?query=sum(rate(http_requests_total{service=\"${SERVICE_NAME}\"}[5m]))" | jq '.data.result[0].value[1]'

# Check response times
curl -s "http://10.0.1.30:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket{service=\"${SERVICE_NAME}\"}[5m]))" | jq '.data.result[0].value[1]'
```

**Verification:**
- Review metrics to confirm scaling decision
- Document current performance baseline
- Identify bottlenecks (CPU, memory, I/O, network)

### Step 4: Calculate Target Replica Count

```bash
# Set target replicas based on scaling decision
# For scale up example:
TARGET_REPLICAS=8

# For scale down example:
# TARGET_REPLICAS=3

# Verify target is reasonable
if [ ${TARGET_REPLICAS} -gt 20 ]; then
  echo "WARNING: Scaling to more than 20 replicas requires approval"
fi

# Calculate scaling increment
SCALE_INCREMENT=$((TARGET_REPLICAS - CURRENT_REPLICAS))

echo "Scaling from ${CURRENT_REPLICAS} to ${TARGET_REPLICAS} (${SCALE_INCREMENT:+${SCALE_INCREMENT}})"

# Validate resource requirements
PER_REPLICA_CPU=$(docker service inspect ${SERVICE_NAME} \
  --format='{{.Spec.TaskTemplate.Resources.Reservations.NanoCPUs}}' | \
  awk '{print $1/1000000000}')

PER_REPLICA_MEM=$(docker service inspect ${SERVICE_NAME} \
  --format='{{.Spec.TaskTemplate.Resources.Reservations.MemoryBytes}}' | \
  awk '{print $1/1024/1024}')

TOTAL_CPU=$(echo "${PER_REPLICA_CPU} * ${TARGET_REPLICAS}" | bc)
TOTAL_MEM=$(echo "${PER_REPLICA_MEM} * ${TARGET_REPLICAS}" | bc)

echo "Resource requirements:"
echo "  CPU: ${TOTAL_CPU} cores"
echo "  Memory: ${TOTAL_MEM} MB"
```

**Verification:**
```bash
# Confirm sufficient resources available
echo "Confirm scaling to ${TARGET_REPLICAS} replicas?"
echo "This will consume ${TOTAL_CPU} CPU cores and ${TOTAL_MEM}MB memory"
```

### Step 5: Perform Gradual Scaling (Recommended)

For large scaling operations, scale gradually to monitor impact:

```bash
# Scale gradually in steps
STEP_SIZE=2  # Scale by 2 replicas at a time
DELAY=60     # Wait 60 seconds between steps

CURRENT=${CURRENT_REPLICAS}

while [ ${CURRENT} -ne ${TARGET_REPLICAS} ]; do
  # Calculate next step
  if [ ${CURRENT} -lt ${TARGET_REPLICAS} ]; then
    NEXT=$((CURRENT + STEP_SIZE))
    if [ ${NEXT} -gt ${TARGET_REPLICAS} ]; then
      NEXT=${TARGET_REPLICAS}
    fi
    ACTION="Scaling up"
  else
    NEXT=$((CURRENT - STEP_SIZE))
    if [ ${NEXT} -lt ${TARGET_REPLICAS} ]; then
      NEXT=${TARGET_REPLICAS}
    fi
    ACTION="Scaling down"
  fi
  
  echo "${ACTION} from ${CURRENT} to ${NEXT} replicas..."
  docker service scale ${SERVICE_NAME}=${NEXT}
  
  # Wait for scaling to complete
  sleep ${DELAY}
  
  # Verify replicas are running
  RUNNING=$(docker service ps ${SERVICE_NAME} \
    --filter "desired-state=running" \
    --format "{{.CurrentState}}" | grep Running | wc -l)
  
  echo "Running replicas: ${RUNNING}/${NEXT}"
  
  CURRENT=${NEXT}
done

echo "Scaling complete: ${TARGET_REPLICAS} replicas"
```

**Verification:**
```bash
# Verify final replica count
docker service ls | grep ${SERVICE_NAME}

# Check all replicas are running
docker service ps ${SERVICE_NAME} --filter "desired-state=running"

# Verify health
docker service ps ${SERVICE_NAME} | grep -E "Running|Ready"
```

### Step 6: Perform Immediate Scaling (For Urgent Situations)

```bash
# For immediate scaling (e.g., traffic spike)
docker service scale ${SERVICE_NAME}=${TARGET_REPLICAS}

echo "Scaling initiated at $(date)"

# Monitor scaling progress
watch -n 5 'docker service ps '${SERVICE_NAME}' --filter "desired-state=running" --format "table {{.Name}}\t{{.Node}}\t{{.CurrentState}}"'
```

**Verification:**
```bash
# Wait for convergence
while true; do
  RUNNING=$(docker service ps ${SERVICE_NAME} \
    --filter "desired-state=running" \
    --format "{{.CurrentState}}" | grep Running | wc -l)
  
  echo "Running: ${RUNNING}/${TARGET_REPLICAS}"
  
  if [ ${RUNNING} -eq ${TARGET_REPLICAS} ]; then
    echo "Scaling complete"
    break
  fi
  
  sleep 5
done
```

### Step 7: Verify Replica Distribution

```bash
# Check replica distribution across nodes
echo "=== Replica Distribution ==="
docker service ps ${SERVICE_NAME} \
  --filter "desired-state=running" \
  --format "{{.Node}}" | sort | uniq -c

# Ideal distribution should be balanced
# Example output:
#   3 swarm-worker-01
#   3 swarm-worker-02
#   2 swarm-worker-03

# If distribution is unbalanced, rebalance
docker service update --force ${SERVICE_NAME}
```

**Verification:**
```bash
# Wait for rebalance
sleep 30

# Check distribution again
docker service ps ${SERVICE_NAME} \
  --filter "desired-state=running" \
  --format "{{.Node}}" | sort | uniq -c
```

### Step 8: Monitor Service Health After Scaling

```bash
# Monitor service health
docker service ps ${SERVICE_NAME} --filter "desired-state=running"

# Check for any failed tasks
docker service ps ${SERVICE_NAME} | grep -E "Failed|Rejected"

# Monitor logs for errors
docker service logs ${SERVICE_NAME} --since 5m | grep -i error

# Check health check status
for container in $(docker ps -q -f name=${SERVICE_NAME}); do
  echo "=== Container: $container ==="
  docker inspect $container --format='{{.State.Health.Status}}'
done
```

**Verification:**
- All replicas in "Running" state
- No failed or rejected tasks
- Health checks passing
- No error spikes in logs

### Step 9: Verify Load Balancing

```bash
# Test load distribution
echo "Testing load distribution across replicas..."

for i in {1..20}; do
  curl -s http://localhost/api/hostname
  sleep 0.5
done | sort | uniq -c

# Should see requests distributed across multiple hosts

# Check nginx load balancing stats
docker service logs hosting_nginx --since 5m | grep upstream | tail -20

# Monitor connection distribution
docker exec $(docker ps -q -f name=hosting_nginx | head -1) \
  cat /var/log/nginx/access.log | tail -50 | grep -oP 'upstream: \K[^,]+'
```

**Verification:**
- Requests distributed across all replicas
- No single replica receiving disproportionate traffic
- Load balancer health checks passing

### Step 10: Monitor Performance Metrics

```bash
# Check CPU usage after scaling
echo "=== CPU Usage ==="
curl -s "http://10.0.1.30:9090/api/v1/query?query=avg(rate(container_cpu_usage_seconds_total{service=\"${SERVICE_NAME}\"}[5m]))" | jq -r '.data.result[0].value[1]'

# Check memory usage
echo "=== Memory Usage ==="
curl -s "http://10.0.1.30:9090/api/v1/query?query=avg(container_memory_usage_bytes{service=\"${SERVICE_NAME}\"})/1024/1024" | jq -r '.data.result[0].value[1]'

# Check response times
echo "=== Response Time (95th percentile) ==="
curl -s "http://10.0.1.30:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket{service=\"${SERVICE_NAME}\"}[5m]))" | jq -r '.data.result[0].value[1]'

# Check request rate per replica
echo "=== Requests per Replica ==="
TOTAL_REQUESTS=$(curl -s "http://10.0.1.30:9090/api/v1/query?query=sum(rate(http_requests_total{service=\"${SERVICE_NAME}\"}[5m]))" | jq -r '.data.result[0].value[1]')
REQUESTS_PER_REPLICA=$(echo "scale=2; ${TOTAL_REQUESTS} / ${TARGET_REPLICAS}" | bc)
echo "${REQUESTS_PER_REPLICA} req/s per replica"
```

**Verification:**
- CPU usage decreased after scale up (or increased after scale down as expected)
- Memory usage per replica within limits
- Response times improved or stable
- Load evenly distributed

### Step 11: Update Auto-Scaling Configuration (Optional)

```bash
# If using auto-scaling, update thresholds
cat > /opt/scripts/autoscale-${SERVICE_NAME}.sh <<'EOF'
#!/bin/bash
SERVICE_NAME="hosting_app"
MIN_REPLICAS=3
MAX_REPLICAS=15
TARGET_CPU=60

# Get current metrics
CURRENT_CPU=$(curl -s "http://10.0.1.30:9090/api/v1/query?query=avg(rate(container_cpu_usage_seconds_total{service=\"${SERVICE_NAME}\"}[5m]))*100" | jq -r '.data.result[0].value[1]' | cut -d. -f1)

CURRENT_REPLICAS=$(docker service ls --filter "name=${SERVICE_NAME}" --format "{{.Replicas}}" | cut -d'/' -f1)

# Scale decision
if [ ${CURRENT_CPU} -gt 70 ] && [ ${CURRENT_REPLICAS} -lt ${MAX_REPLICAS} ]; then
  NEW_REPLICAS=$((CURRENT_REPLICAS + 1))
  echo "Scaling up to ${NEW_REPLICAS} replicas (CPU: ${CURRENT_CPU}%)"
  docker service scale ${SERVICE_NAME}=${NEW_REPLICAS}
elif [ ${CURRENT_CPU} -lt 30 ] && [ ${CURRENT_REPLICAS} -gt ${MIN_REPLICAS} ]; then
  NEW_REPLICAS=$((CURRENT_REPLICAS - 1))
  echo "Scaling down to ${NEW_REPLICAS} replicas (CPU: ${CURRENT_CPU}%)"
  docker service scale ${SERVICE_NAME}=${NEW_REPLICAS}
else
  echo "No scaling needed (Replicas: ${CURRENT_REPLICAS}, CPU: ${CURRENT_CPU}%)"
fi
EOF

chmod +x /opt/scripts/autoscale-${SERVICE_NAME}.sh

# Test the script
/opt/scripts/autoscale-${SERVICE_NAME}.sh

# Add to cron if not already present
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/scripts/autoscale-${SERVICE_NAME}.sh >> /var/log/autoscale-${SERVICE_NAME}.log 2>&1") | crontab -
```

**Verification:**
```bash
# Verify cron job added
crontab -l | grep autoscale

# Check autoscale log
tail -f /var/log/autoscale-${SERVICE_NAME}.log
```

### Step 12: Document Scaling Event

```bash
# Log the scaling event
cat >> /var/log/scaling-events.log <<EOF
========================================
Scaling Event
========================================
Date: $(date)
Service: ${SERVICE_NAME}
Previous Replicas: ${CURRENT_REPLICAS}
New Replicas: ${TARGET_REPLICAS}
Reason: [Manual/Auto] - [Load increase/decrease/Testing/etc]
Performed By: $(whoami)
Status: SUCCESS

Performance Before:
  CPU: [X]%
  Memory: [Y] MB
  Response Time: [Z] ms

Performance After:
  CPU: [X]%
  Memory: [Y] MB
  Response Time: [Z] ms

Notes:
- Scaling completed successfully
- All replicas healthy
- Performance metrics improved

========================================

EOF

# Update capacity planning document
echo "$(date): ${SERVICE_NAME} scaled to ${TARGET_REPLICAS} replicas" >> /docs/capacity-planning.log
```

---

## Scaling Down Procedure

### Step 1: Verify Safe to Scale Down

```bash
# Check current load
CURRENT_LOAD=$(curl -s "http://10.0.1.30:9090/api/v1/query?query=sum(rate(http_requests_total{service=\"${SERVICE_NAME}\"}[5m]))" | jq -r '.data.result[0].value[1]')

echo "Current load: ${CURRENT_LOAD} req/s"

# Calculate capacity after scale down
TARGET_REPLICAS_DOWN=3
CAPACITY_AFTER=$((TARGET_REPLICAS_DOWN * 100))  # Assuming 100 req/s per replica

if (( $(echo "${CURRENT_LOAD} > ${CAPACITY_AFTER} * 0.7" | bc -l) )); then
  echo "WARNING: Scaling down may impact performance"
  echo "Current load (${CURRENT_LOAD}) > 70% of new capacity (${CAPACITY_AFTER})"
else
  echo "Safe to scale down"
fi
```

### Step 2: Scale Down Gradually

```bash
# Scale down one replica at a time
CURRENT=$(docker service ls --filter "name=${SERVICE_NAME}" --format "{{.Replicas}}" | cut -d'/' -f1)
TARGET=3

while [ ${CURRENT} -gt ${TARGET} ]; do
  NEXT=$((CURRENT - 1))
  
  echo "Scaling down from ${CURRENT} to ${NEXT} replicas..."
  docker service scale ${SERVICE_NAME}=${NEXT}
  
  # Wait and monitor
  sleep 60
  
  # Check performance metrics
  CPU=$(curl -s "http://10.0.1.30:9090/api/v1/query?query=avg(rate(container_cpu_usage_seconds_total{service=\"${SERVICE_NAME}\"}[5m]))*100" | jq -r '.data.result[0].value[1]' | cut -d. -f1)
  
  echo "Current CPU usage: ${CPU}%"
  
  # Stop if CPU is too high
  if [ ${CPU} -gt 80 ]; then
    echo "WARNING: CPU usage too high, stopping scale down"
    break
  fi
  
  CURRENT=${NEXT}
done

echo "Scale down complete: ${CURRENT} replicas"
```

**Verification:**
```bash
# Monitor for 10 minutes after scale down
for i in {1..10}; do
  echo "=== Minute ${i} ==="
  docker service ps ${SERVICE_NAME} --filter "desired-state=running"
  docker stats --no-stream $(docker ps -q -f name=${SERVICE_NAME})
  sleep 60
done
```

---

## Rollback Procedure

### Rollback to Previous Replica Count

```bash
# If scaling caused issues, rollback
echo "Rolling back to ${CURRENT_REPLICAS} replicas..."
docker service scale ${SERVICE_NAME}=${CURRENT_REPLICAS}

# Monitor rollback
watch -n 5 'docker service ps '${SERVICE_NAME}' --filter "desired-state=running"'

# Verify rollback
RUNNING=$(docker service ps ${SERVICE_NAME} \
  --filter "desired-state=running" \
  --format "{{.CurrentState}}" | grep Running | wc -l)

echo "Rollback complete: ${RUNNING}/${CURRENT_REPLICAS} replicas running"
```

**Verification:**
```bash
# Verify service health after rollback
docker service ps ${SERVICE_NAME}

# Check metrics
curl -s "http://10.0.1.30:9090/api/v1/query?query=avg(rate(container_cpu_usage_seconds_total{service=\"${SERVICE_NAME}\"}[5m]))" | jq
```

---

## Troubleshooting

### Issue: Cannot Scale Up - Insufficient Resources

**Symptoms:**
- New replicas stuck in "Pending" state
- Error: "no suitable node"

**Resolution:**
```bash
# Check node resources
for node in $(docker node ls -q); do
  docker node inspect $node --format '{{.Description.Hostname}}: {{.Description.Resources}}'
done

# Check node availability
docker node ls

# Update node to active if drained
docker node update --availability active <node-name>

# Add more nodes to cluster
# Or reduce resource reservations
docker service update \
  --reserve-cpu 0.25 \
  --reserve-memory 256M \
  ${SERVICE_NAME}

# Retry scaling
docker service scale ${SERVICE_NAME}=${TARGET_REPLICAS}
```

### Issue: Replicas Failing After Scale Up

**Symptoms:**
- New replicas start but crash
- Failed health checks

**Resolution:**
```bash
# Check logs of failed replicas
docker service logs ${SERVICE_NAME} --tail 100

# Check resource limits
docker stats $(docker ps -q -f name=${SERVICE_NAME})

# Increase resource limits if needed
docker service update \
  --limit-memory 2G \
  --limit-cpu 2 \
  ${SERVICE_NAME}

# Check for configuration issues
docker service inspect ${SERVICE_NAME} --pretty

# Verify health check configuration
docker service inspect ${SERVICE_NAME} \
  --format='{{json .Spec.TaskTemplate.ContainerSpec.HealthCheck}}' | jq
```

### Issue: Uneven Load Distribution

**Symptoms:**
- Some replicas receiving more traffic than others
- Inconsistent response times

**Resolution:**
```bash
# Force rebalance
docker service update --force ${SERVICE_NAME}

# Check load balancer configuration
docker service logs hosting_nginx --since 5m

# Verify all replicas are reachable
for container in $(docker ps -q -f name=${SERVICE_NAME}); do
  IP=$(docker inspect $container --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
  echo "Testing ${IP}..."
  curl -f http://${IP}:3000/health
done

# Update load balancer algorithm if needed
# Edit nginx configuration to use different algorithm (round-robin, least_conn, ip_hash)
```

### Issue: Performance Degraded After Scaling Down

**Symptoms:**
- Increased response times
- Higher CPU/memory usage
- Request timeouts

**Resolution:**
```bash
# Immediately scale back up
docker service scale ${SERVICE_NAME}=${CURRENT_REPLICAS}

# Monitor recovery
watch -n 5 'docker stats --no-stream $(docker ps -q -f name='${SERVICE_NAME}')'

# Review metrics
curl -s "http://10.0.1.30:9090/api/v1/query?query=rate(http_requests_total{service=\"${SERVICE_NAME}\"}[5m])" | jq

# Adjust minimum replica count
MIN_REPLICAS=${CURRENT_REPLICAS}
echo "New minimum replicas: ${MIN_REPLICAS}"
```

---

## Best Practices

### Scaling Up
- Scale gradually during business hours
- Monitor metrics for 10-15 minutes between scaling operations
- Scale in multiples of 2 for even distribution
- Ensure at least 30% capacity headroom

### Scaling Down
- Only scale down during low-traffic periods
- Scale down one replica at a time
- Wait at least 15 minutes between operations
- Stop if CPU exceeds 70% or response times increase

### Resource Planning
- Maintain 30-40% resource headroom on cluster
- Plan for 2x peak traffic capacity
- Keep minimum 3 replicas for high availability
- Document resource limits per service

---

## Validation Checklist

- [ ] Current state documented
- [ ] Resource availability confirmed
- [ ] Scaling performed successfully
- [ ] Target replica count reached
- [ ] All replicas healthy and running
- [ ] Load evenly distributed
- [ ] Health checks passing
- [ ] Performance metrics acceptable
- [ ] No errors in logs
- [ ] Monitoring updated
- [ ] Scaling event documented
- [ ] Team notified

---

## Related Runbooks

- [01-deploy-new-application.md](./01-deploy-new-application.md) - For deploying new applications
- [02-release-new-version.md](./02-release-new-version.md) - For version updates
- [07-log-analysis.md](./07-log-analysis.md) - For analyzing logs

---

## References

- Docker Service Scale: https://docs.docker.com/engine/reference/commandline/service_scale/
- Docker Service Update: https://docs.docker.com/engine/reference/commandline/service_update/
- Swarm Mode Service Scaling: https://docs.docker.com/engine/swarm/swarm-tutorial/scale-service/
