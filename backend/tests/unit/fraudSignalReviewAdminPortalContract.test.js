'use strict';

const fs = require('fs');
const path = require('path');

const FRAUD_QUEUE =
  path.join(
    __dirname,
    '../../../admin_portal/src/features/support/FraudSignalQueue.jsx'
  );

describe(
  'fraud signal admin portal contract',
  () => {
    const source =
      fs.readFileSync(
        FRAUD_QUEUE,
        'utf8'
      );

    test(
      'shows fraud review inside support console',
      () => {
        expect(source)
          .toContain(
            'Fraud Signal Queue'
          );

        expect(source)
          .toContain(
            'Advisory anomaly signals'
          );
      }
    );

    test(
      'loads a bounded filtered fraud queue',
      () => {
        expect(source)
          .toContain(
            "'/admin/fraud-signals'"
          );

        expect(source)
          .toContain(
            'limit: 50'
          );

        expect(source)
          .toContain(
            'fraudSeverity'
          );

        expect(source)
          .toContain(
            'fraudStatus'
          );
      }
    );

    test(
      'only sends explicit non-open review states',
      () => {
        expect(source)
          .toContain(
            "'reviewed'"
          );

        expect(source)
          .toContain(
            "'dismissed'"
          );

        expect(source)
          .toContain(
            "'escalated'"
          );

        expect(source)
          .not
          .toContain(
            "reviewFraudSignal(\n                              signal,\n                              'open'"
          );
      }
    );

    test(
      'requires confirmation before one-way review action',
      () => {
        expect(source)
          .toContain(
            'window.confirm('
          );

        expect(source)
          .toContain(
            'cannot be changed from this screen'
          );
      }
    );

    test(
      'does not expose raw metrics or evidence in queue cards',
      () => {
        expect(source)
          .not
          .toContain(
            'JSON.stringify(signal.metrics'
          );

        expect(source)
          .not
          .toContain(
            'JSON.stringify(signal.evidence'
          );
      }
    );
  }
);
