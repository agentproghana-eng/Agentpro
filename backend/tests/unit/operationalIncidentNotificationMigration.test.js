'use strict';

const fs =
  require('fs');

const path =
  require('path');

describe(
  'operational incident notification state migration',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          '../../migrations/122_operational_incident_notification_state.sql'
        ),
        'utf8'
      );

    test(
      'adds durable notification lifecycle state',
      () => {
        expect(source)
          .toContain(
            'last_notification_at TIMESTAMPTZ'
          );

        expect(source)
          .toContain(
            'last_notification_severity VARCHAR(16)'
          );

        expect(source)
          .toContain(
            'next_notification_at TIMESTAMPTZ'
          );

        expect(source)
          .toContain(
            'recovery_notification_at TIMESTAMPTZ'
          );
      }
    );

    test(
      'constrains notification severity and recovery state',
      () => {
        expect(source)
          .toContain(
            "last_notification_severity IN ('warning', 'critical')"
          );

        expect(source)
          .toContain(
            'recovery_notification_at IS NULL'
          );

        expect(source)
          .toContain(
            'resolved_at IS NOT NULL'
          );
      }
    );

    test(
      'indexes unresolved incidents by notification due time',
      () => {
        expect(source)
          .toContain(
            'idx_operational_incidents_notification_due'
          );

        expect(source)
          .toContain(
            'WHERE resolved_at IS NULL'
          );
      }
    );
  }
);
