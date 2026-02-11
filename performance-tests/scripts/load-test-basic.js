import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const errorCounter = new Counter('errors');
const responseTime = new Trend('response_time');

// Test configuration
export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp-up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 0 },    // Ramp-down to 0
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],     // 95% of requests must complete below 500ms
    'http_req_failed': ['rate<0.01'],       // Error rate must be less than 1%
    'errors': ['count<10'],                  // Total errors must be less than 10
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost';

export default function () {
  // Health check
  let healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
    'health check has healthy status': (r) => JSON.parse(r.body).status === 'healthy',
  });

  sleep(1);

  // Get all users
  let usersRes = http.get(`${BASE_URL}/api/users`);
  const usersCheck = check(usersRes, {
    'users status is 200': (r) => r.status === 200,
    'users response time < 500ms': (r) => r.timings.duration < 500,
    'users response has data': (r) => JSON.parse(r.body).data !== undefined,
  });

  if (!usersCheck) {
    errorCounter.add(1);
  }

  responseTime.add(usersRes.timings.duration);

  sleep(1);

  // Get specific user
  let userRes = http.get(`${BASE_URL}/api/users/1`);
  check(userRes, {
    'user status is 200': (r) => r.status === 200,
    'user response time < 300ms': (r) => r.timings.duration < 300,
  });

  sleep(1);

  // Create new user (10% of requests)
  if (Math.random() < 0.1) {
    const payload = JSON.stringify({
      name: `User ${Date.now()}`,
      email: `user${Date.now()}@example.com`,
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    let createRes = http.post(`${BASE_URL}/api/users`, payload, params);
    check(createRes, {
      'create user status is 201': (r) => r.status === 201,
      'create user response has id': (r) => JSON.parse(r.body).id !== undefined,
    });
  }

  sleep(2);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'results/load-test-basic.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const colors = options.enableColors ? {
    green: '\x1b[32m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
  } : { green: '', red: '', cyan: '', reset: '' };

  let summary = `
${indent}${colors.cyan}========================================${colors.reset}
${indent}${colors.cyan}Load Test Summary${colors.reset}
${indent}${colors.cyan}========================================${colors.reset}

${indent}Scenarios: ${data.metrics.scenarios ? Object.keys(data.metrics.scenarios).length : 1}
${indent}VUs: ${data.metrics.vus ? data.metrics.vus.values.max : 'N/A'}
${indent}Duration: ${data.state.testRunDurationMs / 1000}s

${indent}${colors.cyan}HTTP Metrics:${colors.reset}
${indent}  Requests: ${data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0}
${indent}  Failed: ${data.metrics.http_req_failed ? (data.metrics.http_req_failed.values.rate * 100).toFixed(2) : 0}%
${indent}  Duration (avg): ${data.metrics.http_req_duration ? data.metrics.http_req_duration.values.avg.toFixed(2) : 0}ms
${indent}  Duration (p95): ${data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(95)'].toFixed(2) : 0}ms
${indent}  Duration (p99): ${data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(99)'].toFixed(2) : 0}ms

${indent}${colors.green}Test ${data.metrics.checks && data.metrics.checks.values.rate === 1 ? 'PASSED' : 'FAILED'}${colors.reset}
`;

  return summary;
}
