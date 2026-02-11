# Runbook: Log Analysis

**Document Version:** 1.0  
**Last Updated:** 2024-02  
**Estimated Time:** 15-45 minutes  
**Skill Level:** Intermediate

## Overview

This runbook provides procedures for analyzing logs across the hosting platform to troubleshoot issues, identify patterns, monitor performance, and investigate security incidents.

---

## Prerequisites

### Required Access
- SSH access to swarm manager node (10.0.1.10)
- Access to Prometheus/Grafana (10.0.1.30)
- Docker service access

### Required Information
- Time range for analysis
- Service or component to analyze
- Issue description or symptoms

### Tools Required
```bash
# Verify tools are installed
docker --version
jq --version || sudo apt-get install -y jq
grep --version
awk --version
```

---

## Log Sources

| Component | Log Location | Format | Retention |
|-----------|-------------|--------|-----------|
| Application | Docker service logs | JSON | 7 days |
| PostgreSQL | Docker container logs | Text | 7 days |
| Redis | Docker container logs | Text | 7 days |
| Nginx | Volume `/var/log/nginx` | Combined | 30 days |
| Prometheus | Docker container logs | Text | 7 days |
| Grafana | Docker container logs | Text | 7 days |
| System | `/var/log/syslog` | Text | 30 days |
| Docker | `journalctl -u docker` | JSON | 30 days |

---

## Procedure

### Step 1: Identify Log Source

```bash
# SSH to swarm manager
ssh manager@10.0.1.10

# List all running services
docker service ls

# List all containers
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

# Identify log source based on issue
# For application issues:
export LOG_SOURCE="hosting_app"

# For database issues:
# export LOG_SOURCE="hosting_postgres"

# For load balancer issues:
# export LOG_SOURCE="hosting_nginx"
```

### Step 2: Basic Log Viewing

```bash
# View recent logs (last 100 lines)
docker service logs ${LOG_SOURCE} --tail 100

# View logs with timestamps
docker service logs ${LOG_SOURCE} --timestamps --tail 100

# Follow logs in real-time
docker service logs ${LOG_SOURCE} --follow

# View logs from specific time
docker service logs ${LOG_SOURCE} --since 2024-02-15T10:00:00

# View logs for specific duration
docker service logs ${LOG_SOURCE} --since 1h

# View logs from specific container
CONTAINER_ID=$(docker ps -q -f name=${LOG_SOURCE} | head -1)
docker logs ${CONTAINER_ID} --tail 100
```

**Common Time Filters:**
- `--since 10m` - Last 10 minutes
- `--since 1h` - Last hour
- `--since 24h` - Last 24 hours
- `--since 2024-02-15` - Since specific date
- `--until 2024-02-15T12:00:00` - Until specific time

### Step 3: Search for Errors

```bash
# Search for errors in last hour
docker service logs ${LOG_SOURCE} --since 1h | grep -i error

# Search for errors with context (5 lines before and after)
docker service logs ${LOG_SOURCE} --since 1h | grep -i -A 5 -B 5 error

# Count errors
docker service logs ${LOG_SOURCE} --since 1h | grep -i error | wc -l

# Search for multiple patterns
docker service logs ${LOG_SOURCE} --since 1h | grep -iE "error|exception|fatal|critical"

# Search for errors by severity
docker service logs ${LOG_SOURCE} --since 1h | grep -E "(ERROR|CRITICAL|FATAL)"

# Get unique error messages
docker service logs ${LOG_SOURCE} --since 1h | grep -i error | sort | uniq

# Count error occurrences
docker service logs ${LOG_SOURCE} --since 1h | grep -i error | sort | uniq -c | sort -rn
```

**Common Error Patterns:**
```bash
# Connection errors
docker service logs ${LOG_SOURCE} --since 1h | grep -iE "connection|timeout|refused"

# Database errors
docker service logs ${LOG_SOURCE} --since 1h | grep -iE "database|sql|query"

# Memory errors
docker service logs ${LOG_SOURCE} --since 1h | grep -iE "memory|oom|heap"

# Authentication errors
docker service logs ${LOG_SOURCE} --since 1h | grep -iE "auth|unauthorized|forbidden"
```

### Step 4: Analyze Application Logs

```bash
# For JSON formatted logs
docker service logs hosting_app --since 1h | grep -E '^\{' | jq '.'

# Filter by log level
docker service logs hosting_app --since 1h | jq 'select(.level == "error")'

# Group errors by type
docker service logs hosting_app --since 1h | \
  jq -r 'select(.level == "error") | .error.type' | \
  sort | uniq -c | sort -rn

# Analyze response times
docker service logs hosting_app --since 1h | \
  jq -r 'select(.response_time) | .response_time' | \
  awk '{sum+=$1; count++} END {print "Avg:", sum/count, "ms"}'

# Find slowest requests
docker service logs hosting_app --since 1h | \
  jq 'select(.response_time > 1000)' | \
  jq -r '[.timestamp, .method, .path, .response_time] | @tsv' | \
  sort -k4 -rn | head -20

# Analyze by endpoint
docker service logs hosting_app --since 1h | \
  jq -r 'select(.path) | .path' | \
  sort | uniq -c | sort -rn | head -20

# Analyze by HTTP status code
docker service logs hosting_app --since 1h | \
  jq -r 'select(.status) | .status' | \
  sort | uniq -c | sort -rn

# Find 5xx errors
docker service logs hosting_app --since 1h | \
  jq 'select(.status >= 500)'

# Analyze by user/client
docker service logs hosting_app --since 1h | \
  jq -r 'select(.user_id) | .user_id' | \
  sort | uniq -c | sort -rn | head -20
```

### Step 5: Analyze Database Logs

```bash
# View PostgreSQL logs
docker logs $(docker ps -q -f name=hosting_postgres) --since 1h

# Search for slow queries
docker logs $(docker ps -q -f name=hosting_postgres) --since 1h | \
  grep "duration:" | \
  awk '{print $NF}' | \
  sort -rn | head -20

# Find connection errors
docker logs $(docker ps -q -f name=hosting_postgres) --since 1h | \
  grep -iE "connection|client|authentication"

# Find deadlocks
docker logs $(docker ps -q -f name=hosting_postgres) --since 1h | \
  grep -i deadlock

# Find failed queries
docker logs $(docker ps -q -f name=hosting_postgres) --since 1h | \
  grep -iE "error|fatal|panic"

# Analyze database connections
docker exec $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} <<'EOF'

-- Active connections
SELECT 
  pid,
  usename,
  application_name,
  client_addr,
  state,
  now() - query_start as duration,
  query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

-- Connection count by state
SELECT state, count(*) 
FROM pg_stat_activity 
GROUP BY state;

-- Slow queries from pg_stat_statements
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 20;

\q
EOF
```

### Step 6: Analyze Nginx Access Logs

```bash
# Get nginx container
NGINX_CONTAINER=$(docker ps -q -f name=hosting_nginx | head -1)

# View recent access logs
docker exec ${NGINX_CONTAINER} tail -100 /var/log/nginx/access.log

# Analyze request rate
docker exec ${NGINX_CONTAINER} \
  awk '{print $4}' /var/log/nginx/access.log | \
  cut -d: -f1-2 | \
  sort | uniq -c | tail -20

# Top requested URLs
docker exec ${NGINX_CONTAINER} \
  awk '{print $7}' /var/log/nginx/access.log | \
  sort | uniq -c | sort -rn | head -20

# Top client IPs
docker exec ${NGINX_CONTAINER} \
  awk '{print $1}' /var/log/nginx/access.log | \
  sort | uniq -c | sort -rn | head -20

# HTTP status code distribution
docker exec ${NGINX_CONTAINER} \
  awk '{print $9}' /var/log/nginx/access.log | \
  sort | uniq -c | sort -rn

# Find 4xx errors
docker exec ${NGINX_CONTAINER} \
  awk '$9 ~ /^4/ {print $7, $9}' /var/log/nginx/access.log | \
  sort | uniq -c | sort -rn | head -20

# Find 5xx errors
docker exec ${NGINX_CONTAINER} \
  awk '$9 ~ /^5/ {print $0}' /var/log/nginx/access.log

# Response time analysis
docker exec ${NGINX_CONTAINER} \
  awk '{print $NF}' /var/log/nginx/access.log | \
  grep -E '^[0-9]' | \
  awk '{sum+=$1; count++} END {print "Avg:", sum/count, "s"}'

# Requests per minute
docker exec ${NGINX_CONTAINER} \
  awk '{print $4}' /var/log/nginx/access.log | \
  cut -d: -f1-3 | \
  sort | uniq -c

# User agents
docker exec ${NGINX_CONTAINER} \
  awk -F'"' '{print $6}' /var/log/nginx/access.log | \
  sort | uniq -c | sort -rn | head -20
```

### Step 7: Analyze Nginx Error Logs

```bash
# View error logs
docker exec ${NGINX_CONTAINER} tail -100 /var/log/nginx/error.log

# Count errors by type
docker exec ${NGINX_CONTAINER} \
  grep -oE '\[error\]|\[warn\]|\[crit\]' /var/log/nginx/error.log | \
  sort | uniq -c

# Find upstream errors
docker exec ${NGINX_CONTAINER} \
  grep -i upstream /var/log/nginx/error.log | tail -20

# Connection timeout errors
docker exec ${NGINX_CONTAINER} \
  grep -i timeout /var/log/nginx/error.log | tail -20

# SSL/TLS errors
docker exec ${NGINX_CONTAINER} \
  grep -i ssl /var/log/nginx/error.log | tail -20
```

### Step 8: Analyze Redis Logs

```bash
# View Redis logs
docker logs $(docker ps -q -f name=hosting_redis) --since 1h

# Search for warnings/errors
docker logs $(docker ps -q -f name=hosting_redis) --since 1h | \
  grep -iE "warning|error"

# Check for OOM errors
docker logs $(docker ps -q -f name=hosting_redis) --since 1h | \
  grep -i "out of memory"

# Check connection issues
docker logs $(docker ps -q -f name=hosting_redis) --since 1h | \
  grep -i "connection"

# Analyze Redis performance
docker exec $(docker ps -q -f name=hosting_redis) \
  redis-cli -a ${REDIS_PASSWORD} --no-auth-warning INFO stats | \
  grep -E "total_commands|instantaneous"
```

### Step 9: Analyze System Logs

```bash
# View Docker daemon logs
journalctl -u docker --since "1 hour ago" --no-pager

# Search for Docker errors
journalctl -u docker --since "1 hour ago" --no-pager | grep -i error

# View system logs
tail -100 /var/log/syslog

# Search for OOM events
journalctl --since "1 hour ago" --no-pager | grep -i "out of memory"

# Search for disk space issues
journalctl --since "1 hour ago" --no-pager | grep -i "no space"

# Check for failed services
systemctl --failed

# View kernel messages
dmesg | tail -100
```

### Step 10: Time-Series Analysis

```bash
# Analyze error patterns over time (hourly)
for hour in {0..23}; do
  HOUR=$(printf "%02d" $hour)
  COUNT=$(docker service logs hosting_app --since 24h | \
    grep -E "^.*T${HOUR}:" | \
    grep -i error | wc -l)
  echo "${HOUR}:00 - ${COUNT} errors"
done

# Request volume by hour
for hour in {0..23}; do
  HOUR=$(printf "%02d" $hour)
  COUNT=$(docker exec ${NGINX_CONTAINER} \
    grep "T${HOUR}:" /var/log/nginx/access.log 2>/dev/null | wc -l)
  echo "${HOUR}:00 - ${COUNT} requests"
done

# Error rate over time (last 10 minutes, per minute)
for min in {0..9}; do
  TIME=$(date -d "$min minutes ago" "+%Y-%m-%dT%H:%M")
  COUNT=$(docker service logs hosting_app --since 10m | \
    grep "^.*${TIME}" | \
    grep -i error | wc -l)
  echo "${TIME} - ${COUNT} errors"
done
```

### Step 11: Cross-Service Log Correlation

```bash
# Find logs across all services for specific time
TIMESTAMP="2024-02-15T10:30"

echo "=== Application Logs ==="
docker service logs hosting_app --since 1h | grep "${TIMESTAMP}"

echo "=== Database Logs ==="
docker logs $(docker ps -q -f name=hosting_postgres) --since 1h | grep "${TIMESTAMP}"

echo "=== Nginx Logs ==="
docker exec ${NGINX_CONTAINER} grep "${TIMESTAMP}" /var/log/nginx/access.log

# Trace request by ID
REQUEST_ID="req-abc123"

echo "=== Tracing Request ${REQUEST_ID} ==="
docker service logs hosting_app --since 1h | grep "${REQUEST_ID}"
docker exec ${NGINX_CONTAINER} grep "${REQUEST_ID}" /var/log/nginx/access.log
```

### Step 12: Create Log Report

```bash
# Generate comprehensive log report
REPORT_FILE="/tmp/log-report-$(date +%Y%m%d-%H%M%S).txt"

cat > ${REPORT_FILE} <<EOF
========================================
Log Analysis Report
========================================
Generated: $(date)
Time Range: Last 1 hour
Analyzed By: $(whoami)

========================================
1. Application Errors
========================================
EOF

docker service logs hosting_app --since 1h | \
  grep -i error | \
  sort | uniq -c | sort -rn | head -20 \
  >> ${REPORT_FILE}

cat >> ${REPORT_FILE} <<EOF

========================================
2. HTTP Status Codes
========================================
EOF

docker service logs hosting_app --since 1h | \
  jq -r 'select(.status) | .status' 2>/dev/null | \
  sort | uniq -c | sort -rn \
  >> ${REPORT_FILE}

cat >> ${REPORT_FILE} <<EOF

========================================
3. Top Requested Endpoints
========================================
EOF

docker exec ${NGINX_CONTAINER} \
  awk '{print $7}' /var/log/nginx/access.log 2>/dev/null | \
  tail -1000 | sort | uniq -c | sort -rn | head -20 \
  >> ${REPORT_FILE}

cat >> ${REPORT_FILE} <<EOF

========================================
4. Top Client IPs
========================================
EOF

docker exec ${NGINX_CONTAINER} \
  awk '{print $1}' /var/log/nginx/access.log 2>/dev/null | \
  tail -1000 | sort | uniq -c | sort -rn | head -20 \
  >> ${REPORT_FILE}

cat >> ${REPORT_FILE} <<EOF

========================================
5. Database Issues
========================================
EOF

docker logs $(docker ps -q -f name=hosting_postgres) --since 1h | \
  grep -iE "error|warning" | tail -20 \
  >> ${REPORT_FILE}

cat >> ${REPORT_FILE} <<EOF

========================================
6. Service Status
========================================
EOF

docker service ls >> ${REPORT_FILE}

cat >> ${REPORT_FILE} <<EOF

========================================
End of Report
========================================
EOF

# Display report
cat ${REPORT_FILE}

# Save report
cp ${REPORT_FILE} /var/log/analysis-reports/

echo "Report saved to: ${REPORT_FILE}"
```

---

## Common Log Analysis Patterns

### Debugging Application Crash

```bash
# Find last logs before crash
docker service logs hosting_app --since 2h | tail -200

# Look for specific crash indicators
docker service logs hosting_app --since 2h | \
  grep -iE "fatal|panic|segmentation|core dump"

# Check for OOM
docker service logs hosting_app --since 2h | \
  grep -i "out of memory"

# Check restart events
docker service ps hosting_app | grep -E "Starting|Shutdown"
```

### Investigating Performance Issues

```bash
# Find slow requests (>2 seconds)
docker service logs hosting_app --since 1h | \
  jq 'select(.response_time > 2000)' | \
  jq -r '[.path, .response_time] | @tsv' | \
  sort -k2 -rn

# Database query performance
docker exec $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT query, calls, mean_time, max_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Check for high CPU/memory usage in logs
docker stats --no-stream
```

### Security Incident Investigation

```bash
# Find failed authentication attempts
docker service logs hosting_app --since 24h | \
  grep -iE "unauthorized|forbidden|auth.*failed"

# Suspicious IPs (multiple failed attempts)
docker exec ${NGINX_CONTAINER} \
  awk '$9 == "401" || $9 == "403" {print $1}' /var/log/nginx/access.log | \
  sort | uniq -c | sort -rn | head -20

# SQL injection attempts
docker exec ${NGINX_CONTAINER} \
  grep -iE "union.*select|exec.*xp_|' or |<script" /var/log/nginx/access.log

# Unusual request patterns
docker exec ${NGINX_CONTAINER} \
  awk '{print $7}' /var/log/nginx/access.log | \
  grep -E '\.\.|%00|etc/passwd'
```

### Database Connection Issues

```bash
# Connection pool exhaustion
docker service logs hosting_app --since 1h | \
  grep -iE "connection.*pool|too many connections"

# Connection timeouts
docker service logs hosting_app --since 1h | \
  grep -i "connection.*timeout"

# Check current connections
docker exec $(docker ps -q -f name=hosting_postgres) \
  psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT count(*) FROM pg_stat_activity;"
```

---

## Advanced Analysis with Prometheus

```bash
# Query error rate
curl -s "http://10.0.1.30:9090/api/v1/query?query=rate(http_requests_total{status=~'5..'}[5m])" | jq

# Query response time percentiles
curl -s "http://10.0.1.30:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket[5m]))" | jq

# Query request rate by endpoint
curl -s "http://10.0.1.30:9090/api/v1/query?query=sum(rate(http_requests_total[5m]))by(path)" | jq

# Query container resource usage
curl -s "http://10.0.1.30:9090/api/v1/query?query=sum(rate(container_cpu_usage_seconds_total{name=~'hosting_app.*'}[5m]))by(name)" | jq
```

---

## Log Retention and Rotation

```bash
# Check Docker log size
docker system df

# Configure log rotation in docker-compose
cat > /opt/docker-compose/logging.yml <<'EOF'
x-logging: &default-logging
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
    labels: "service"
EOF

# Manually clean old logs
docker system prune --volumes --force

# Clean nginx logs older than 30 days
docker exec ${NGINX_CONTAINER} \
  find /var/log/nginx -type f -name "*.log" -mtime +30 -delete
```

---

## Troubleshooting

### Issue: Logs Not Showing

**Resolution:**
```bash
# Check if service is running
docker service ps ${LOG_SOURCE}

# Check logging driver
docker service inspect ${LOG_SOURCE} \
  --format='{{.Spec.TaskTemplate.LogDriver}}'

# Check container exists
docker ps -a | grep ${LOG_SOURCE}

# Try direct container logs
docker logs $(docker ps -q -f name=${LOG_SOURCE})
```

### Issue: Too Much Log Data

**Resolution:**
```bash
# Use time filters
docker service logs ${LOG_SOURCE} --since 10m --tail 100

# Filter by pattern
docker service logs ${LOG_SOURCE} --since 1h | grep "specific pattern"

# Output to file for analysis
docker service logs ${LOG_SOURCE} --since 1h > /tmp/logs.txt
```

---

## Validation Checklist

- [ ] Log source identified
- [ ] Time range defined
- [ ] Error patterns identified
- [ ] Performance issues found
- [ ] Security incidents checked
- [ ] Cross-service correlation performed
- [ ] Root cause identified
- [ ] Report generated
- [ ] Findings documented

---

## Related Runbooks

- [02-release-new-version.md](./02-release-new-version.md) - For deployment issues
- [03-scale-containers.md](./03-scale-containers.md) - For performance issues
- [08-platform-restart.md](./08-platform-restart.md) - For system issues

---

## References

- Docker Logs: https://docs.docker.com/engine/reference/commandline/logs/
- Nginx Log Analysis: https://www.nginx.com/blog/using-nginx-logging-for-application-performance/
- PostgreSQL Logging: https://www.postgresql.org/docs/current/runtime-config-logging.html
