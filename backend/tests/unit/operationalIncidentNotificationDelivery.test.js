'use strict';

const mockWithTransaction =
  jest.fn();

const mockEnqueue =
  jest.fn();

const mockDecision =
  jest.fn();

const mockRecordDecision =
  jest.fn();

jest.mock(
  '../../src/config/database',
  () => ({
    withTransaction:
      (...args) =>
        mockWithTransaction(
          ...args
        ),
  })
);

jest.mock(
  '../../src/services/outboxService',
  () => ({
    enqueueOutboxEvent:
      (...args) =>
        mockEnqueue(
          ...args
        ),
  })
);

jest.mock(
  '../../src/services/operationalIncidentNotificationPolicy',
  () => ({
    notificationDecisionForIncident:
      (...args) =>
        mockDecision(
          ...args
        ),
    recordNotificationDecision:
      (...args) =>
        mockRecordDecision(
          ...args
        ),
  })
);

const {
  buildNotificationContent,
  notificationDedupeKey,
  processOperationalIncidentNotifications,
} = require(
  '../../src/services/operationalIncidentNotificationDelivery'
);

function dueIncident(
  overrides = {}
) {
  return {
    id: 41,
    incident_key:
      'provider:telecel',
    alert_code:
      'provider_telecel_degraded',
    component:
      'provider_health',
    severity:
      'warning',
    first_seen_at:
      new Date(
        '2026-09-10T10:00:00.000Z'
      ),
    last_seen_at:
      new Date(
        '2026-09-10T10:10:00.000Z'
      ),
    resolved_at: null,
    last_notification_at:
      null,
    last_notification_severity:
      null,
    next_notification_at:
      null,
    recovery_notification_at:
      null,
    ...overrides,
  };
}

describe(
  'operational incident notification delivery',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockWithTransaction
        .mockImplementation(
          async (fn) =>
            fn(mockClient)
        );

      mockEnqueue
        .mockResolvedValue({
          id: 'outbox-id',
          status: 'pending',
          deduplicated: false,
        });

      mockRecordDecision
        .mockResolvedValue({
          recorded: true,
          row: {
            id: 41,
          },
        });
    });

    const mockClient = {
      query:
        jest.fn(),
    };

    beforeEach(() => {
      mockClient.query
        .mockReset();
    });

    test(
      'builds concise warning, escalation, reminder and recovery content',
      () => {
        expect(
          buildNotificationContent({
            kind: 'opened',
            severity: 'warning',
            component:
              'provider_health',
          }).title
        ).toContain(
          'Operational Incident'
        );

        expect(
          buildNotificationContent({
            kind: 'escalated',
            severity: 'critical',
            component:
              'provider_health',
          }).title
        ).toContain(
          'Escalated'
        );

        expect(
          buildNotificationContent({
            kind: 'reminder',
            severity: 'critical',
            component:
              'provider_health',
          }).body
        ).toContain(
          'remains unresolved'
        );

        expect(
          buildNotificationContent({
            kind: 'recovered',
            severity: 'warning',
            component:
              'provider_health',
          }).title
        ).toContain(
          'Recovered'
        );
      }
    );

    test(
      'dedupe key includes incident transition, timestamp and recipient',
      () => {
        expect(
          notificationDedupeKey({
            incidentId: 41,
            kind: 'opened',
            recipientId:
              'superuser-1',
            decidedAt:
              '2026-09-10T16:30:00.000Z',
          })
        ).toBe(
          'operational-incident:41:opened:2026-09-10T16:30:00.000Z:superuser-1'
        );
      }
    );

    test(
      'returns without querying recipients when no incidents are due',
      async () => {
        mockClient.query
          .mockResolvedValueOnce({
            rows: [],
          });

        const result =
          await processOperationalIncidentNotifications({
            now:
              '2026-09-10T16:30:00.000Z',
          });

        expect(result)
          .toEqual({
            considered: 0,
            enqueued: 0,
            state_advanced: 0,
            no_recipients: false,
          });

        expect(
          mockClient.query
        ).toHaveBeenCalledTimes(1);

        expect(
          mockEnqueue
        ).not.toHaveBeenCalled();

        expect(
          mockRecordDecision
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'keeps incident due when no active superuser recipient exists',
      async () => {
        mockClient.query
          .mockResolvedValueOnce({
            rows: [
              dueIncident(),
            ],
          })
          .mockResolvedValueOnce({
            rows: [],
          });

        const result =
          await processOperationalIncidentNotifications({
            now:
              '2026-09-10T16:30:00.000Z',
          });

        expect(result)
          .toEqual({
            considered: 1,
            enqueued: 0,
            state_advanced: 0,
            no_recipients: true,
          });

        expect(
          mockEnqueue
        ).not.toHaveBeenCalled();

        expect(
          mockRecordDecision
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'atomically enqueues every recipient before advancing incident state',
      async () => {
        const incident =
          dueIncident();

        mockClient.query
          .mockResolvedValueOnce({
            rows: [
              incident,
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  'user-a',
              },
              {
                id:
                  'user-b',
              },
            ],
          });

        mockDecision
          .mockReturnValue({
            notify: true,
            kind: 'opened',
            incident_id: 41,
            severity:
              'warning',
            decided_at:
              '2026-09-10T16:30:00.000Z',
          });

        const order = [];

        mockEnqueue
          .mockImplementation(
            async () => {
              order.push(
                'enqueue'
              );

              return {
                id:
                  'outbox-id',
                status:
                  'pending',
                deduplicated:
                  false,
              };
            }
          );

        mockRecordDecision
          .mockImplementation(
            async () => {
              order.push(
                'state'
              );

              return {
                recorded: true,
                row: {
                  id: 41,
                },
              };
            }
          );

        const result =
          await processOperationalIncidentNotifications({
            now:
              '2026-09-10T16:30:00.000Z',
          });

        expect(order)
          .toEqual([
            'enqueue',
            'enqueue',
            'state',
          ]);

        expect(result)
          .toEqual({
            considered: 1,
            enqueued: 2,
            state_advanced: 1,
            no_recipients: false,
          });

        expect(
          mockEnqueue
        ).toHaveBeenCalledTimes(2);

        expect(
          mockRecordDecision
        ).toHaveBeenCalledTimes(1);
      }
    );

    test(
      'uses transactional outbox event with null UUID aggregate id',
      async () => {
        const incident =
          dueIncident();

        mockClient.query
          .mockResolvedValueOnce({
            rows: [
              incident,
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  'user-a',
              },
            ],
          });

        mockDecision
          .mockReturnValue({
            notify: true,
            kind: 'opened',
            incident_id: 41,
            severity:
              'warning',
            decided_at:
              '2026-09-10T16:30:00.000Z',
          });

        await processOperationalIncidentNotifications({
          now:
            '2026-09-10T16:30:00.000Z',
        });

        expect(
          mockEnqueue
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            dbClient:
              mockClient,
            eventType:
              'notification.operational_incident',
            aggregateType:
              'operational_incident',
            aggregateId:
              null,
            payload:
              expect.objectContaining({
                user_id:
                  'user-a',
                incident_id:
                  '41',
                incident_key:
                  'provider:telecel',
                severity:
                  'warning',
                kind:
                  'opened',
              }),
          })
        );
      }
    );

    test(
      'does not advance state when an outbox enqueue fails',
      async () => {
        mockClient.query
          .mockResolvedValueOnce({
            rows: [
              dueIncident(),
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  'user-a',
              },
            ],
          });

        mockDecision
          .mockReturnValue({
            notify: true,
            kind:
              'opened',
            incident_id: 41,
            severity:
              'warning',
            decided_at:
              '2026-09-10T16:30:00.000Z',
          });

        mockEnqueue
          .mockRejectedValue(
            new Error(
              'enqueue failed'
            )
          );

        await expect(
          processOperationalIncidentNotifications({
            now:
              '2026-09-10T16:30:00.000Z',
          })
        ).rejects.toThrow(
          'enqueue failed'
        );

        expect(
          mockRecordDecision
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'fails transaction when state advancement is rejected',
      async () => {
        mockClient.query
          .mockResolvedValueOnce({
            rows: [
              dueIncident(),
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  'user-a',
              },
            ],
          });

        mockDecision
          .mockReturnValue({
            notify: true,
            kind:
              'opened',
            incident_id: 41,
            severity:
              'warning',
            decided_at:
              '2026-09-10T16:30:00.000Z',
          });

        mockRecordDecision
          .mockResolvedValue({
            recorded: false,
            row: null,
          });

        await expect(
          processOperationalIncidentNotifications({
            now:
              '2026-09-10T16:30:00.000Z',
          })
        ).rejects.toMatchObject({
          code:
            'OPERATIONAL_NOTIFICATION_STATE_ADVANCE_FAILED',
        });
      }
    );

    test(
      'locks due incident rows and skips rows locked elsewhere',
      async () => {
        mockClient.query
          .mockResolvedValueOnce({
            rows: [],
          });

        await processOperationalIncidentNotifications({
          now:
            '2026-09-10T16:30:00.000Z',
        });

        expect(
          mockClient.query
            .mock.calls[0][0]
        ).toContain(
          'FOR UPDATE SKIP LOCKED'
        );
      }
    );
  }
);
