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
    'AGENTPRO_ACCESS_TOKEN is required.'
  );
}

export const options = {
  vus: 1,
  duration: '4m',

  thresholds: {
    http_req_failed: ['rate<0.01'],

    'http_req_duration{endpoint:marketplace_list}': [
      'p(50)<500',
      'p(95)<1000',
      'p(99)<1500',
    ],

    'http_req_duration{endpoint:marketplace_categories}': [
      'p(50)<500',
      'p(95)<1000',
      'p(99)<1500',
    ],
  },
};

const routes = [
  {
    endpoint: 'marketplace_list',
    path: '/api/v1/marketplace?page=1&limit=20',
  },
  {
    endpoint: 'marketplace_categories',
    path: '/api/v1/marketplace/categories',
  },
];

export default function () {
  const route =
    routes[__ITER % routes.length];

  const response = http.get(
    `${config.baseUrl}${route.path}`,
    {
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
      },

      tags: {
        scenario: 'marketplace_baseline',
        endpoint: route.endpoint,
      },

      timeout: '15s',
    }
  );

  if (response.status === 401) {
    exec.test.abort(
      `AUTH_EXPIRED endpoint=${route.name || route.endpoint}`
    );
  }

  check(response, {
    [`${route.endpoint}: status 200`]:
      (r) => r.status === 200,

    [`${route.endpoint}: JSON`]:
      (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch (_) {
          return false;
        }
      },
  });

  // Keep direct production traffic far below
  // the 100 requests/minute per-IP limiter.
  sleep(2.5);
}
