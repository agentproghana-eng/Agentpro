'use strict';

const fs =
  require('fs');

const path =
  require('path');

describe(
  'operational incident email-state migration',
  () => {
    const sql =
      fs.readFileSync(
        path.join(
          __dirname,
          '../../migrations/123_operational_incident_email_state.sql'
        ),
        'utf8'
      );

    test(
      'adds independent durable email lifecycle state',
      () => {
        expect(sql)
          .toContain(
            'last_email_at TIMESTAMPTZ'
          );

        expect(sql)
          .toContain(
            'next_email_at TIMESTAMPTZ'
          );

        expect(sql)
          .toContain(
            'recovery_email_at TIMESTAMPTZ'
          );
      }
    );

    test(
      'email lifecycle is not implemented by reusing push notification columns',
      () => {
        expect(sql)
          .not.toContain(
            'SET last_notification_at'
          );

        expect(sql)
          .toContain(
            'idx_operational_incidents_email_due'
          );
      }
    );
  }
);
