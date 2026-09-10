'use strict';

const fs = require('fs');
const path = require('path');

describe('login telemetry route contract', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../../src/routes/auth.routes.js'
    ),
    'utf8'
  );

  test('login telemetry runs before auth limiter', () => {
    expect(source).toContain(
      "router.post('/login', loginTelemetry, authLimiter, ["
    );
  });

  test('does not instrument every authentication route', () => {
    expect(source).not.toContain(
      "router.use(loginTelemetry)"
    );

    expect(source).not.toContain(
      "router.post('/register', loginTelemetry"
    );

    expect(source).not.toContain(
      "router.post('/refresh', loginTelemetry"
    );
  });
});
