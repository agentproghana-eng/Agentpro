'use strict';

const fs = require('fs');
const path = require('path');

const serverSource = fs.readFileSync(
  path.join(__dirname, '../../server.js'),
  'utf8'
);

describe('performance telemetry server contract', () => {
  test('exposes only the protected internal endpoint', () => {
    expect(serverSource).toContain(
      "'/internal/performance'"
    );

    expect(serverSource).toContain(
      'requirePerformanceTelemetry'
    );
  });

  test('starts telemetry only when enabled', () => {
    expect(serverSource).toContain(
      'if (performanceTelemetryEnabled())'
    );

    expect(serverSource).toContain(
      'startPerformanceTelemetry();'
    );
  });

  test('stops telemetry during graceful shutdown', () => {
    expect(serverSource).toContain(
      'stopPerformanceTelemetry();'
    );
  });

  test('does not expose a public metrics route', () => {
    expect(serverSource).not.toContain(
      "app.get('/metrics'"
    );

    expect(serverSource).not.toContain(
      'app.get("/metrics"'
    );
  });
});
