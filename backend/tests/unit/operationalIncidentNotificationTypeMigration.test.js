'use strict';

const fs =
  require('fs');

const path =
  require('path');

describe(
  'operational incident notification type migration',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          '../../migrations/124_operational_incident_notification_type.sql'
        ),
        'utf8'
      );

    test(
      'adds operational_incident to notification_type safely',
      () => {
        expect(source)
          .toContain(
            'ALTER TYPE notification_type'
          );

        expect(source)
          .toContain(
            "ADD VALUE IF NOT EXISTS 'operational_incident'"
          );
      }
    );
  }
);
