'use strict';

const fs =
  require('fs');

const path =
  require('path');

describe(
  'operational incident monitor scheduler contract',
  () => {
    const scheduler =
      fs.readFileSync(
        path.join(
          __dirname,
          '../../src/jobs/scheduler.js'
        ),
        'utf8'
      );

    const server =
      fs.readFileSync(
        path.join(
          __dirname,
          '../../server.js'
        ),
        'utf8'
      );

    test(
      'scheduler owns incident monitor lifecycle',
      () => {
        expect(scheduler)
          .toContain(
            "require('../services/operationalIncidentMonitor')"
          );

        expect(scheduler)
          .toContain(
            'startOperationalIncidentMonitor()'
          );

        expect(scheduler)
          .toContain(
            'await stopIncidentMonitor()'
          );
      }
    );

    test(
      'protected performance HTTP route remains read only',
      () => {
        const routeStart =
          server.indexOf(
            "'/internal/performance'"
          );

        expect(routeStart)
          .toBeGreaterThan(-1);

        const routeSlice =
          server.slice(
            routeStart,
            routeStart + 900
          );

        expect(routeSlice)
          .toContain(
            'performanceSnapshot()'
          );

        expect(routeSlice)
          .not.toContain(
            'reconcileOperationalIncidents'
          );

        expect(routeSlice)
          .not.toContain(
            'operational_incidents'
          );
      }
    );
  }
);
