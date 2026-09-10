'use strict';

const mockPerformanceSnapshot =
  jest.fn();

const mockReconcile =
  jest.fn();

const mockProcessNotifications =
  jest.fn();

const mockLoggerInfo =
  jest.fn();

const mockLoggerError =
  jest.fn();

jest.mock(
  '../../src/services/performanceTelemetryService',
  () => ({
    performanceSnapshot:
      (...args) =>
        mockPerformanceSnapshot(
          ...args
        ),
  })
);

jest.mock(
  '../../src/services/operationalIncidentService',
  () => ({
    reconcileOperationalIncidents:
      (...args) =>
        mockReconcile(
          ...args
        ),
  })
);

jest.mock(
  '../../src/services/operationalIncidentNotificationDelivery',
  () => ({
    processOperationalIncidentNotifications:
      (...args) =>
        mockProcessNotifications(
          ...args
        ),
  })
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      info:
        (...args) =>
          mockLoggerInfo(
            ...args
          ),
      error:
        (...args) =>
          mockLoggerError(
            ...args
          ),
    },
  })
);

jest.mock(
  '../../src/config/database',
  () => ({
    pool: {
      connect:
        jest.fn(),
    },
  })
);

const {
  INCIDENT_MONITOR_LOCK_KEY,
  telemetryEnabled,
  tryAcquireLeadership,
  releaseLeadership,
  runIncidentReconciliation,
  startOperationalIncidentMonitor,
} = require(
  '../../src/services/operationalIncidentMonitor'
);

describe(
  'operational incident singleton monitor',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockProcessNotifications
        .mockResolvedValue({
          considered: 0,
          enqueued: 0,
          state_advanced: 0,
          no_recipients: false,
        });

      jest.useRealTimers();
    });

    test(
      'is enabled only with explicit performance telemetry enablement',
      () => {
        expect(
          telemetryEnabled({
            PERFORMANCE_TELEMETRY_ENABLED:
              'true',
          })
        ).toBe(true);

        expect(
          telemetryEnabled({
            PERFORMANCE_TELEMETRY_ENABLED:
              'TRUE',
          })
        ).toBe(true);

        expect(
          telemetryEnabled({
            PERFORMANCE_TELEMETRY_ENABLED:
              'false',
          })
        ).toBe(false);

        expect(
          telemetryEnabled({})
        ).toBe(false);
      }
    );

    test(
      'acquires PostgreSQL advisory leadership on a dedicated client',
      async () => {
        const release =
          jest.fn();

        const client = {
          query:
            jest.fn()
              .mockResolvedValue({
                rows: [
                  {
                    acquired:
                      true,
                  },
                ],
              }),
          release,
        };

        const dbPool = {
          connect:
            jest.fn()
              .mockResolvedValue(
                client
              ),
        };

        const result =
          await tryAcquireLeadership({
            dbPool,
          });

        expect(result)
          .toBe(client);

        expect(
          client.query
            .mock.calls[0][0]
        ).toContain(
          'pg_try_advisory_lock'
        );

        expect(
          client.query
            .mock.calls[0][1]
        ).toEqual([
          INCIDENT_MONITOR_LOCK_KEY,
        ]);

        expect(release)
          .not.toHaveBeenCalled();
      }
    );

    test(
      'releases client immediately when another instance owns leadership',
      async () => {
        const release =
          jest.fn();

        const client = {
          query:
            jest.fn()
              .mockResolvedValue({
                rows: [
                  {
                    acquired:
                      false,
                  },
                ],
              }),
          release,
        };

        const result =
          await tryAcquireLeadership({
            dbPool: {
              connect:
                jest.fn()
                  .mockResolvedValue(
                    client
                  ),
            },
          });

        expect(result)
          .toBeNull();

        expect(release)
          .toHaveBeenCalledTimes(1);
      }
    );

    test(
      'releases advisory lock before returning client to pool',
      async () => {
        const events = [];

        const client = {
          query:
            jest.fn(
              async () => {
                events.push(
                  'unlock'
                );

                return {
                  rows: [
                    {
                      released:
                        true,
                    },
                  ],
                };
              }
            ),
          release:
            jest.fn(() => {
              events.push(
                'release'
              );
            }),
        };

        await releaseLeadership({
          client,
        });

        expect(
          client.query
            .mock.calls[0][0]
        ).toContain(
          'pg_advisory_unlock'
        );

        expect(events)
          .toEqual([
            'unlock',
            'release',
          ]);
      }
    );

    test(
      'reconciles the evaluated alert snapshot using its timestamp',
      async () => {
        mockPerformanceSnapshot
          .mockResolvedValue({
            timestamp:
              '2026-09-10T13:30:00.000Z',
            operational_alerts: {
              status:
                'warning',
              alerts: [
                {
                  code:
                    'api_5xx_rate_high',
                },
              ],
            },
          });

        mockReconcile
          .mockResolvedValue({
            active: [],
            resolved: [],
          });

        await runIncidentReconciliation();

        expect(
          mockReconcile
        ).toHaveBeenCalledWith(
          {
            status:
              'warning',
            alerts: [
              {
                code:
                  'api_5xx_rate_high',
              },
            ],
          },
          {
            observedAt:
              '2026-09-10T13:30:00.000Z',
          }
        );

        expect(
          mockProcessNotifications
        ).toHaveBeenCalledWith({
          now:
            '2026-09-10T13:30:00.000Z',
        });
      }
    );

    test(
      'disabled monitor performs no database or reconciliation work',
      async () => {
        const dbPool = {
          connect:
            jest.fn(),
        };

        const stop =
          startOperationalIncidentMonitor({
            dbPool,
            env: {
              PERFORMANCE_TELEMETRY_ENABLED:
                'false',
            },
          });

        await stop();

        expect(
          dbPool.connect
        ).not.toHaveBeenCalled();

        expect(
          mockPerformanceSnapshot
        ).not.toHaveBeenCalled();

        expect(
          mockReconcile
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'non-leader skips reconciliation',
      async () => {
        jest.useFakeTimers();

        const client = {
          query:
            jest.fn()
              .mockResolvedValue({
                rows: [
                  {
                    acquired:
                      false,
                  },
                ],
              }),
          release:
            jest.fn(),
        };

        const dbPool = {
          connect:
            jest.fn()
              .mockResolvedValue(
                client
              ),
        };

        const stop =
          startOperationalIncidentMonitor({
            dbPool,
            intervalMs:
              60000,
            env: {
              PERFORMANCE_TELEMETRY_ENABLED:
                'true',
            },
          });

        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(
          mockPerformanceSnapshot
        ).not.toHaveBeenCalled();

        expect(
          mockReconcile
        ).not.toHaveBeenCalled();

        await stop();
      }
    );

    test(
      'leader keeps advisory lock client for subsequent reconciliation ticks',
      async () => {
        jest.useFakeTimers();

        const client = {
          query:
            jest.fn()
              .mockResolvedValueOnce({
                rows: [
                  {
                    acquired:
                      true,
                  },
                ],
              })
              .mockResolvedValueOnce({
                rows: [
                  {
                    released:
                      true,
                  },
                ],
              }),
          release:
            jest.fn(),
        };

        const dbPool = {
          connect:
            jest.fn()
              .mockResolvedValue(
                client
              ),
        };

        mockPerformanceSnapshot
          .mockResolvedValue({
            timestamp:
              '2026-09-10T13:31:00.000Z',
            operational_alerts: {
              status:
                'operational',
              alerts: [],
            },
          });

        mockReconcile
          .mockResolvedValue({
            active: [],
            resolved: [],
          });

        const stop =
          startOperationalIncidentMonitor({
            dbPool,
            intervalMs:
              60000,
            env: {
              PERFORMANCE_TELEMETRY_ENABLED:
                'true',
            },
          });

        await jest.advanceTimersByTimeAsync(
          0
        );

        expect(
          dbPool.connect
        ).toHaveBeenCalledTimes(1);

        expect(
          mockPerformanceSnapshot
        ).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(
          60000
        );

        expect(
          dbPool.connect
        ).toHaveBeenCalledTimes(1);

        expect(
          mockPerformanceSnapshot
        ).toHaveBeenCalledTimes(2);

        await stop();

        expect(
          client.query.mock.calls
            .some(
              ([sql]) =>
                sql.includes(
                  'pg_advisory_unlock'
                )
            )
        ).toBe(true);

        expect(
          client.release
        ).toHaveBeenCalledTimes(1);
      }
    );
  }
);
