'use strict';

const fs =
  require('fs');

const path =
  require('path');

const ADMIN_ROUTE =
  path.join(
    __dirname,
    '../../src/routes/admin.routes.js'
  );

describe(
  'fraud signal admin review contract',
  () => {
    const source =
      fs.readFileSync(
        ADMIN_ROUTE,
        'utf8'
      );

    test(
      'remains behind fail-closed admin authorization',
      () => {
        expect(source)
          .toContain(
            'requireAdminPortalAccess'
          );
      }
    );

    test(
      'exposes bounded queue and detail endpoints',
      () => {
        expect(source)
          .toContain(
            "router.get('/fraud-signals'"
          );

        expect(source)
          .toContain(
            "router.get('/fraud-signals/:id'"
          );
      }
    );

    test(
      'reviews signals through a transaction',
      () => {
        expect(source)
          .toContain(
            "router.patch('/fraud-signals/:id/review'"
          );

        expect(source)
          .toContain(
            'await withTransaction('
          );

        expect(source)
          .toContain(
            'reviewFraudSignal({'
          );
      }
    );

    test(
      'strictly audits the review mutation',
      () => {
        expect(source)
          .toContain(
            "'FRAUD_SIGNAL_REVIEWED'"
          );

        expect(source)
          .toContain(
            "entityType:\n              'fraud_signal'"
          );

        expect(source)
          .toContain(
            'strict: true'
          );
      }
    );
  }
);
