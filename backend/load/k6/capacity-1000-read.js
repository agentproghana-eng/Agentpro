'use strict';

import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';

import { loadConfig } from './lib/config.js';

const config = loadConfig();

const accessToken = String(
  __ENV.AGENTPRO_ACCESS_TOKEN || ''
).trim();

if (accessToken.length < 32) {
  throw new Error(
    'AGENTPRO_ACCESS_TOKEN is required for the 1000 VU capacity gate.'
  );
}

const forbiddenHosts = new Set([
  'agentpro-api-izi3.onrender.com',
  'api.agentpro.intellicoresystem.com',
]);

if (forbiddenHosts.has(config.hostname)) {
  throw new Error(
    'The 1000 VU capacity gate must not run against production.'
  );
}

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '2m', target: 250 },
    { duration: '2m', target: 500 },
    { duration: '3m', target: 1000 },
    { duration: '5m', target: 1000 },
    { duration: '2m', target: 0 },
  ],

  gracefulRampDown: '30s',

  thresholds: {
    http_req_failed: [
      'rate<0.01',
    ],

    http_req_duration: [
      'p(50)<500',
      'p(95)<1000',
      'p(99)<2000',
    ],

    'http_req_duration{endpoint:auth_me}': [
      'p(95)<1000',
    ],

    'http_req_duration{endpoint:transactions}': [
      'p(95)<1500',
    ],

    'http_req_duration{endpoint:notifications}': [
      'p(95)<1500',
    ],

    'http_req_duration{endpoint:marketplace}': [
      'p(95)<1500',
    ],

    'http_req_duration{endpoint:marketplace_categories}': [
      'p(95)<1000',
    ],

    'http_req_duration{endpoint:report_dashboard}': [
      'p(95)<1500',
    ],
  },
};

const routes = [
  {
    name: 'auth_me',
    path: '/api/v1/auth/me',
  },
  {
    name: 'transactions',
    path: '/api/v1/transactions?page=1&limit=20',
  },
  {
    name: 'notifications',
    path: '/api/v1/notifications?page=1&limit=20',
  },
  {
    name: 'marketplace',
    path: '/api/v1/marketplace?page=1&limit=20',
  },
  {
    name: 'marketplace_categories',
    path: '/api/v1/marketplace/categories',
  },
  {
    name: 'report_dashboard',
    path: '/api/v1/reports/dashboard',
  },
];

export default function () {
  const routeIndex =
    (__VU - 1 + __ITER) % routes.length;

  const route =
    routes[routeIndex];

  const response = http.get(
    `${config.baseUrl}${route.path}`,
    {
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
      },

      tags: {
        scenario:
          'capacity_1000_read',
        endpoint:
          route.name,
      },

      timeout: '15s',
    }
  );

  if (response.status === 401) {
    exec.test.abort(
      `AUTH_EXPIRED endpoint=${route.name}`
    );
  }

  const ok = check(response, {
    [`${route.name}: status 200`]:
      (r) => r.status === 200,

    [`${route.name}: JSON response`]:
      (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch (_) {
          return false;
        }
      },
  });

  if (!ok) {
    console.error(
      `READ_CHECK_FAILED endpoint=${route.name} status=${response.status}`
    );
  }

  sleep(1);
}
