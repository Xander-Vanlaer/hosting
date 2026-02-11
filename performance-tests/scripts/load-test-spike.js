import http from 'k6/http';
import { check, sleep } from 'k6';

// Spike test configuration
export let options = {
  stages: [
    { duration: '1m', target: 50 },    // Ramp-up to 50 users
    { duration: '30s', target: 500 },  // Spike to 500 users
    { duration: '5m', target: 500 },   // Stay at 500 users
    { duration: '1m', target: 50 },    // Spike down to 50
    { duration: '1m', target: 0 },     // Ramp-down to 0
  ],
  thresholds: {
    'http_req_duration': ['p(95)<800'],     // 95% of requests under 800ms
    'http_req_failed': ['rate<0.05'],       // Less than 5% errors allowed
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost';

export default function () {
  const responses = http.batch([
    ['GET', `${BASE_URL}/health`],
    ['GET', `${BASE_URL}/api/users`],
    ['GET', `${BASE_URL}/api/users/1`],
  ]);

  check(responses[0], {
    'health status is 200': (r) => r.status === 200,
  });

  check(responses[1], {
    'users status is 200': (r) => r.status === 200,
    'response time acceptable': (r) => r.timings.duration < 1000,
  });

  sleep(Math.random() * 3 + 1); // Random sleep between 1-4 seconds
}
