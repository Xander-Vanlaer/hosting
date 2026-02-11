import http from 'k6/http';
import { check, sleep } from 'k6';

// Soak test configuration - test system stability over time
export let options = {
  stages: [
    { duration: '5m', target: 200 },    // Ramp up to 200 users
    { duration: '2h', target: 200 },    // Stay at 200 users for 2 hours
    { duration: '5m', target: 0 },      // Ramp down to 0
  ],
  thresholds: {
    'http_req_duration': ['p(95)<600'],     // Performance should stay consistent
    'http_req_failed': ['rate<0.02'],       // Low error rate over time
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost';

export default function () {
  // Simulate realistic user behavior
  
  // Browse users
  let usersRes = http.get(`${BASE_URL}/api/users`);
  check(usersRes, {
    'users status is 200': (r) => r.status === 200,
  });
  
  sleep(2);
  
  // View specific user
  let userRes = http.get(`${BASE_URL}/api/users/${Math.floor(Math.random() * 10) + 1}`);
  check(userRes, {
    'user status is 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  
  sleep(3);
  
  // Health check occasionally
  if (Math.random() < 0.1) {
    let healthRes = http.get(`${BASE_URL}/health`);
    check(healthRes, {
      'health status is 200': (r) => r.status === 200,
    });
  }
  
  sleep(5); // Simulate reading time
}

export function handleSummary(data) {
  const duration = data.state.testRunDurationMs / 1000 / 60; // minutes
  
  console.log('');
  console.log('========================================');
  console.log('Soak Test Results');
  console.log('========================================');
  console.log(`Test Duration: ${duration.toFixed(2)} minutes`);
  console.log(`Total Requests: ${data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0}`);
  console.log(`Avg Requests/sec: ${data.metrics.http_reqs ? (data.metrics.http_reqs.values.count / (duration * 60)).toFixed(2) : 0}`);
  console.log(`Failed Requests: ${data.metrics.http_req_failed ? (data.metrics.http_req_failed.values.rate * 100).toFixed(2) : 0}%`);
  console.log(`Response Time p95: ${data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(95)'].toFixed(2) : 0}ms`);
  console.log('========================================');
  
  return {
    'results/load-test-soak.json': JSON.stringify(data),
  };
}
