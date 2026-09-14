'use strict';

const fs =
  require('fs');

const path =
  require('path');

describe(
  'fraud anomaly monitor scheduler contract',
  () => {
    test(
      'scheduler starts and stops fraud anomaly monitor',
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              '../../src/jobs/scheduler.js'
            ),
            'utf8'
          );

        expect(source)
          .toContain(
            "require('../services/fraudAnomalyMonitor')"
          );

        expect(source)
          .toContain(
            'startFraudAnomalyMonitor()'
          );

        expect(source)
          .toContain(
            'await stopFraudAnomalyMonitor()'
          );
      }
    );
  }
);
