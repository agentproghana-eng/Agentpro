'use strict';

const fs =
  require('fs');

const path =
  require('path');

const APP =
  path.join(
    __dirname,
    '../../../admin_portal/src/App.jsx'
  );

describe(
  'fraud signal admin portal contract',
  () => {
    const source =
      fs.readFileSync(
        APP,
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
        const start =
          source.indexOf(
            'Fraud Signal Queue'
          );

        const end =
          source.indexOf(
            'Support Console',
            start
          );

        const panel =
          source.slice(
            start,
            end
          );

        expect(panel)
          .not
          .toContain(
            'JSON.stringify(signal.metrics'
          );

        expect(panel)
          .not
          .toContain(
            'JSON.stringify(signal.evidence'
          );
      }
    );
  }
);
