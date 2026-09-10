'use strict';

const fs = require('fs');
const path = require('path');

describe('API request telemetry server contract', () => {
  const serverSource = fs.readFileSync(
    path.join(__dirname, '../../server.js'),
    'utf8'
  );

  test('mounts telemetry only on API traffic', () => {
    expect(serverSource).toContain(
      "app.use('/api/', apiRequestTelemetry);"
    );

    expect(serverSource).not.toContain(
      "app.use('/health', apiRequestTelemetry)"
    );

    expect(serverSource).not.toContain(
      "app.use('/internal/performance', apiRequestTelemetry)"
    );
  });

  test('records before global API rate limiting', () => {
    const telemetryIndex =
      serverSource.indexOf(
        "app.use('/api/', apiRequestTelemetry);"
      );

    const limiterIndex =
      serverSource.indexOf(
        "app.use('/api/', apiLimiter);"
      );

    expect(telemetryIndex).toBeGreaterThan(-1);
    expect(limiterIndex).toBeGreaterThan(-1);
    expect(telemetryIndex).toBeLessThan(
      limiterIndex
    );
  });
});
