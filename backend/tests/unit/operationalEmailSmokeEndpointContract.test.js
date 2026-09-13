'use strict';

const fs =
  require('fs');

const path =
  require('path');

describe(
  'operational email smoke endpoint contract',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          '../../server.js'
        ),
        'utf8'
      );

    test(
      'uses the protected internal telemetry boundary',
      () => {
        expect(source)
          .toContain(
            "'/internal/performance/operational-email-test'"
          );

        const routeStart =
          source.indexOf(
            "'/internal/performance/operational-email-test'"
          );

        const routeSection =
          source.slice(
            routeStart,
            routeStart + 2200
          );

        expect(routeSection)
          .toContain(
            'requirePerformanceTelemetry'
          );
      }
    );

    test(
      'uses only synthetic operational metadata',
      () => {
        expect(source)
          .toContain(
            "'observability:email-smoke-test'"
          );

        expect(source)
          .toContain(
            "'operational_email_smoke_test'"
          );

        expect(source)
          .toContain(
            "component:\n            'observability'"
          );
      }
    );

    test(
      'does not accept recipient or incident content from request body',
      () => {
        const routeStart =
          source.indexOf(
            "'/internal/performance/operational-email-test'"
          );

        const routeSection =
          source.slice(
            routeStart,
            routeStart + 2200
          );

        expect(routeSection)
          .not.toContain(
            'req.body'
          );

        expect(routeSection)
          .toContain(
            'OPERATIONAL_ALERT_EMAIL_TO'
          );
      }
    );

    test(
      'uses request-scoped provider idempotency',
      () => {
        expect(source)
          .toContain(
            '`operational-email-smoke/${requestId}`'
          );
      }
    );
  }
);
