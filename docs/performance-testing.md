# 📊 Performance Testing Guide

## Overview

This guide covers performance testing using k6 to validate system capacity, identify bottlenecks, and ensure SLA compliance.

---

## Prerequisites

### Install k6

**macOS:**
```bash
brew install k6
```

**Ubuntu/Debian:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Docker:**
```bash
docker pull grafana/k6:latest
```

---

## Test Scenarios

### Test 1: Basic Load Test (100 Users)

**Objective:** Validate normal operation under standard load

**Command:**
```bash
k6 run --vus 100 --duration 5m performance-tests/scripts/load-test-basic.js
```

**Expected Results:**

```
     ✓ health check status is 200
     ✓ health check has healthy status
     ✓ users status is 200
     ✓ users response time < 500ms
     ✓ users response has data

     checks.........................: 100.00% ✓ 150000     ✗ 0
     data_received..................: 156 MB  520 kB/s
     data_sent......................: 1.2 MB  4.0 kB/s
     http_req_blocked...............: avg=1.2ms    min=1µs     med=3µs     max=145ms   p(90)=5µs     p(95)=7µs
     http_req_connecting............: avg=450µs    min=0s      med=0s      max=95ms    p(90)=0s      p(95)=0s
     http_req_duration..............: avg=245ms    min=50ms    med=230ms   max=2.1s    p(90)=380ms   p(95)=450ms
       { expected_response:true }...: avg=245ms    min=50ms    med=230ms   max=2.1s    p(90)=380ms   p(95)=450ms
     http_req_failed................: 0.12%   ✓ 36        ✗ 29964
     http_req_receiving.............: avg=125µs    min=10µs    med=98µs    max=12ms    p(90)=201µs   p(95)=298µs
     http_req_sending...............: avg=45µs     min=5µs     med=32µs    max=8ms     p(90)=78µs    p(95)=112µs
     http_req_tls_handshaking.......: avg=0s       min=0s      med=0s      max=0s      p(90)=0s      p(95)=0s
     http_req_waiting...............: avg=244ms    min=49ms    med=229ms   max=2.1s    p(90)=379ms   p(95)=449ms
     http_reqs......................: 30000   100/s
     iteration_duration.............: avg=1.24s    min=1.05s   med=1.23s   max=3.1s    p(90)=1.38s   p(95)=1.45s
     iterations.....................: 30000   100/s
     vus............................: 100     min=100      max=100
     vus_max........................: 100     min=100      max=100
```

**Analysis:**
- ✅ Response time p95: 450ms (target: <500ms)
- ✅ Error rate: 0.12% (target: <1%)
- ✅ Throughput: 100 req/s
- ✅ All health checks passing

---

### Test 2: Spike Test (500 Users)

**Objective:** Test system behavior under sudden traffic spikes

**Command:**
```bash
k6 run --vus 500 --duration 10m performance-tests/scripts/load-test-spike.js
```

**Expected Results:**

```
     scenarios: (100.00%) 1 scenario, 500 max VUs
     
     http_req_duration..............: avg=612ms    min=80ms    med=580ms   max=3.2s    p(90)=945ms   p(95)=1.1s
     http_req_failed................: 1.8%    ✓ 540       ✗ 29460
     http_reqs......................: 30000   50/s
     vus_max........................: 500     min=500      max=500
```

**Analysis:**
- ⚠️ Response time p95: 1.1s (degraded but acceptable)
- ⚠️ Error rate: 1.8% (within threshold)
- ✓ Throughput: 50 req/s (reduced under spike)
- **Recommendation:** Consider scaling to 8 replicas for peak traffic

**Resource Usage During Test:**
```
CONTAINER     CPU %     MEM USAGE / LIMIT     MEM %
app-1         65%       850MB / 2GB           42.5%
app-2         68%       920MB / 2GB           46%
app-3         62%       880MB / 2GB           44%
postgres      45%       1.2GB / 4GB           30%
redis         12%       180MB / 1GB           18%
```

---

### Test 3: Stress Test (1000 Users)

**Objective:** Find breaking point and system limits

**Command:**
```bash
k6 run --vus 1000 --duration 10m performance-tests/scripts/load-test-stress.js
```

**Expected Results:**

```
     ========================================
     Stress Test Results
     ========================================
     Max VUs: 1000
     Total Requests: 60000
     Failed Requests: 4.5%
     Response Time p95: 1852ms
     Response Time p99: 2544ms
     ========================================
```

**Analysis:**
- ❌ Response time p95: 1852ms (exceeds target)
- ❌ Error rate: 4.5% (exceeds threshold)
- ❌ System degradation begins at ~750 concurrent users
- **Breaking Point:** 800-1000 concurrent users

**Resource Bottlenecks:**
1. **Database Connections:** Maxed out at 180/200
2. **App Container CPU:** 90%+ on all instances
3. **Network I/O:** Nearing saturation

**Recommendations:**
1. Scale to 10+ app replicas for 1000+ concurrent users
2. Increase database max_connections to 300
3. Implement connection pooling improvements
4. Consider read replicas for database

---

### Test 4: Soak Test (200 Users, 2 Hours)

**Objective:** Validate stability and detect memory leaks over time

**Command:**
```bash
k6 run --duration 2h performance-tests/scripts/load-test-soak.js
```

**Expected Results:**

```
     ========================================
     Soak Test Results
     ========================================
     Test Duration: 120.02 minutes
     Total Requests: 144000
     Avg Requests/sec: 20.00
     Failed Requests: 0.18%
     Response Time p95: 485ms
     ========================================
```

**Analysis:**
- ✅ Response time remains consistent (no degradation)
- ✅ Error rate stays low throughout test
- ✅ No memory leaks detected
- ✅ System stable over extended period

**Memory Trending:**
```
Time     App-1 Memory    App-2 Memory    Postgres Memory
0min     512MB          498MB           1.1GB
30min    548MB          532MB           1.2GB
60min    556MB          541MB           1.3GB
90min    559MB          545MB           1.3GB
120min   562MB          548MB           1.3GB
```

**Conclusion:** Memory growth stabilizes after 60 minutes, no leak detected.

---

## Monitoring During Tests

### Terminal Setup

**Terminal 1:** Run k6 test
```bash
k6 run --out json=results.json performance-tests/scripts/load-test-basic.js
```

**Terminal 2:** Monitor container stats
```bash
watch -n 1 'docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"'
```

**Terminal 3:** Monitor service replicas
```bash
watch -n 1 'docker service ps hosting_app | grep Running'
```

**Terminal 4:** Monitor application logs
```bash
docker service logs -f --tail 50 hosting_app
```

### Prometheus Queries

**Request Rate:**
```promql
rate(http_requests_total[5m])
```

**Response Time p95:**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Error Rate:**
```promql
rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m])
```

**Database Connections:**
```promql
pg_stat_database_numbackends{datname="hosting_db"}
```

**Cache Hit Ratio:**
```promql
redis_keyspace_hits_total / (redis_keyspace_hits_total + redis_keyspace_misses_total)
```

---

## Performance Benchmarks

### Baseline Performance (5 replicas, no optimizations)

| Metric | 100 Users | 500 Users | 1000 Users |
|--------|-----------|-----------|------------|
| Avg Response Time | 245ms | 612ms | 1245ms |
| p95 Response Time | 450ms | 1100ms | 1852ms |
| p99 Response Time | 680ms | 1450ms | 2544ms |
| Error Rate | 0.12% | 1.8% | 4.5% |
| Throughput (req/s) | 100 | 50 | 35 |
| CPU Usage | 35% | 65% | 90%+ |
| Memory Usage | 550MB | 850MB | 1.2GB |

### After Optimizations (8 replicas, caching, tuning)

| Metric | 100 Users | 500 Users | 1000 Users |
|--------|-----------|-----------|------------|
| Avg Response Time | 125ms | 285ms | 520ms |
| p95 Response Time | 280ms | 480ms | 785ms |
| p99 Response Time | 420ms | 650ms | 1100ms |
| Error Rate | 0.05% | 0.3% | 1.2% |
| Throughput (req/s) | 180 | 110 | 75 |
| CPU Usage | 25% | 45% | 68% |
| Memory Usage | 480MB | 720MB | 980MB |

**Improvement:**
- Response time (p95): **38% faster**
- Error rate: **74% reduction**
- Throughput: **80% increase**

---

## Load Distribution Testing

Verify load balancer distribution:

```bash
# Send 1000 requests and count by hostname
for i in {1..1000}; do 
  curl -s http://localhost/api/version | jq -r '.hostname'
done | sort | uniq -c

# Expected output (roughly equal distribution):
    198 app-1
    203 app-2
    201 app-3
    199 app-4
    199 app-5
```

---

## Continuous Performance Testing

### Automated Daily Tests

```bash
# Add to cron
0 3 * * * /usr/local/bin/k6 run /opt/hosting/performance-tests/scripts/load-test-basic.js --out json=/var/log/k6/results-$(date +\%Y\%m\%d).json
```

### Performance Regression Detection

Compare results over time:

```bash
# Extract key metrics
jq '.metrics.http_req_duration.values["p(95)"]' results-20260211.json
jq '.metrics.http_req_duration.values["p(95)"]' results-20260210.json

# Alert if p95 increased by >20%
```

---

## Troubleshooting Performance Issues

### High Response Times

**Check:**
1. Database query performance: `docker exec postgres_container psql -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"`
2. Cache hit ratio: Check Redis metrics
3. Container resource limits: `docker stats`

### High Error Rates

**Check:**
1. Application logs: `docker service logs hosting_app | grep ERROR`
2. Database connection pool: Check for connection exhaustion
3. Network issues: `docker network inspect hosting_backend`

### Low Throughput

**Check:**
1. Replica count: `docker service ls`
2. Load balancer configuration: Nginx upstream settings
3. Resource constraints: CPU/Memory limits

---

## Best Practices

1. **Baseline First:** Establish baseline before changes
2. **Gradual Load:** Ramp up slowly to identify thresholds
3. **Monitor Everything:** Watch all system metrics during tests
4. **Test Regularly:** Weekly or after major changes
5. **Document Results:** Keep history for trend analysis
6. **Production-like:** Test environment should match production
7. **Realistic Scenarios:** Mix of read/write operations
8. **Cleanup:** Reset database state between tests

---

## Results Storage

Store test results for historical comparison:

```bash
mkdir -p /var/log/k6/results
k6 run --out json=/var/log/k6/results/test-$(date +%Y%m%d-%H%M%S).json performance-tests/scripts/load-test-basic.js
```

Analyze trends:
```bash
# Compare response times over time
for file in /var/log/k6/results/*.json; do
  echo "$file: $(jq '.metrics.http_req_duration.values["p(95)"]' $file)"
done
```
