'use strict';

import { check } from 'k6';

export function checkJsonResponse(
  response,
  {
    name = 'request',
    expectedStatuses = [200],
  } = {}
) {
  return check(response, {
    [`${name}: expected status`]: (res) =>
      expectedStatuses.includes(res.status),

    [`${name}: response is JSON`]: (res) => {
      const contentType =
        String(res.headers['Content-Type'] || '')
          .toLowerCase();

      return contentType.includes('application/json');
    },
  });
}
