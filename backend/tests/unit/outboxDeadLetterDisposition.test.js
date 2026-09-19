const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(
  path.join(
    __dirname,
    '../../migrations/129_discard_stale_operational_incident_deadletters.sql'
  ),
  'utf8'
);

describe(
  'stale operational outbox dead-letter disposition',
  () => {
    test(
      'adds a preserved discarded state instead of deleting history',
      () => {
        expect(migration)
          .toContain("'discarded'");

        expect(migration)
          .toContain(
            'discarded_at TIMESTAMPTZ'
          );

        expect(migration)
          .toContain(
            'discard_reason VARCHAR(100)'
          );

        expect(migration)
          .not.toContain(
            'DELETE FROM outbox_events'
          );
      }
    );

    test(
      'targets only the verified legacy operational incident failure',
      () => {
        expect(migration)
          .toContain(
            "status = 'dead_letter'"
          );

        expect(migration)
          .toContain(
            "event_type = 'notification.operational_incident'"
          );

        expect(migration)
          .toContain(
            "aggregate_type = 'operational_incident'"
          );

        expect(migration)
          .toContain(
            "last_error_code = '22P02'"
          );

        expect(migration)
          .toContain(
            'attempts >= max_attempts'
          );

        expect(migration)
          .toContain(
            "dedupe_key LIKE 'operational-incident:%'"
          );

        expect(migration)
          .toContain(
            "TIMESTAMPTZ '2026-09-13 13:02:09+00'"
          );
      }
    );

    test(
      'leaves all unrelated dead letters active for monitoring',
      () => {
        const updateBlock =
          migration.slice(
            migration.indexOf(
              'UPDATE outbox_events'
            )
          );

        expect(updateBlock)
          .toContain(
            "status = 'discarded'"
          );

        expect(updateBlock)
          .not.toContain(
            "event_type <>"
          );

        expect(updateBlock)
          .not.toContain(
            'OR event_type'
          );
      }
    );
  }
);
