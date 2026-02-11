import http from 'k6/http';
import { check, sleep } from 'k6';

// Stress test configuration - push system beyond normal capacity
export let options = {
  stages: [
    { duration: '2m', target: 100 },   // Warm-up
    { duration: '5m', target: 500 },   // Scale to 500
    { duration: '5m', target: 1000 },  // Scale to 1000 (stress)
    { duration: '5m', target: 1500 },  // Scale to 1500 (breaking point)
    { duration: '5m', target: 1000 },  // Scale down
    { duration: '2m', target: 0 },     // Recovery
  ],
  thresholds: {
    'http_req_duration': ['p(95)<1500'],    // More lenient threshold
    'http_req_failed': ['rate<0.1'],        // Up to 10% errors allowed in stress test
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost';

export default function () {
  let res = http.get(`${BASE_URL}/api/users`);
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time acceptable': (r) => r.timings.duration < 2000,
  });

  sleep(0.5); // Shorter sleep for more aggressive load
}

export function handleSummary(data) {
  console.log('');
  console.log('========================================');
  console.log('Stress Test Results');
  console.log('========================================');
  console.log(`Max VUs: ${data.metrics.vus ? data.metrics.vus.values.max : 'N/A'}`);
  console.log(`Total Requests: ${data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0}`);
  console.log(`Failed Requests: ${data.metrics.http_req_failed ? (data.metrics.http_req_failed.values.rate * 100).toFixed(2) : 0}%`);
  console.log(`Response Time p95: ${data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(95)'].toFixed(2) : 0}ms`);
  console.log(`Response Time p99: ${data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(99)'].toFixed(2) : 0}ms`);
  console.log('========================================');
  
  return {
    'results/load-test-stress.json': JSON.stringify(data),
  };
}
