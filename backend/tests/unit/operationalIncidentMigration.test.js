'use strict';

const fs =
  require('fs');

const path =
  require('path');

describe(
  'operational incident migration',
  () => {
    const migration =
      fs.readFileSync(
        path.join(
          __dirname,
          '../../migrations/121_operational_incidents.sql'
        ),
        'utf8'
      );

    test(
      'creates durable incident lifecycle storage',
      () => {
        expect(migration)
          .toContain(
            'CREATE TABLE operational_incidents'
          );

        expect(migration)
          .toContain(
            'first_seen_at TIMESTAMPTZ'
          );

        expect(migration)
          .toContain(
            'last_seen_at TIMESTAMPTZ'
          );

        expect(migration)
          .toContain(
            'occurrence_count BIGINT'
          );

        expect(migration)
          .toContain(
            'resolved_at TIMESTAMPTZ'
          );
      }
    );

    test(
      'enforces one unresolved incident per stable key',
      () => {
        expect(migration)
          .toContain(
            'uq_operational_incidents_active_key'
          );

        expect(migration)
          .toContain(
            'ON operational_incidents (incident_key)'
          );

        expect(migration)
          .toContain(
            'WHERE resolved_at IS NULL'
          );
      }
    );

    test(
      'constrains severity and aggregate payload shapes',
      () => {
        expect(migration)
          .toContain(
            "CHECK (severity IN ('warning', 'critical'))"
          );

        expect(migration)
          .toContain(
            "jsonb_typeof(latest_observed) = 'object'"
          );

        expect(migration)
          .toContain(
            "jsonb_typeof(latest_threshold) = 'object'"
          );
      }
    );
  }
);
