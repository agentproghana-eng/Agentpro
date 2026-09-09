'use strict';

import http from 'k6/http';
import { sleep } from 'k6';

import { loadConfig } from './lib/config.js';
import { checkJsonResponse } from './lib/checks.js';

const config = loadConfig();

export const options = {
  vus: 1,
  duration: '20s',

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: [
      'p(50)<250',
      'p(95)<500',
      'p(99)<1000',
    ],
  },
};

export default function () {
  const response = http.get(
    `${config.baseUrl}/health`,
    {
      tags: {
        scenario: 'smoke',
        endpoint: 'health',
      },
    }
  );

  checkJsonResponse(response, {
    name: 'health',
    expectedStatuses: [200],
  });

  sleep(1);
}
