'use strict';

const {
  WARNING_REMINDER_MS,
  CRITICAL_REMINDER_MS,
  cooldownMsForSeverity,
  notificationDecisionForIncident,
  nextNotificationAt,
  recordNotificationDecision,
} = require(
  '../../src/services/operationalIncidentNotificationPolicy'
);

function incident(
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
      '2026-09-10T10:00:00.000Z',
    last_seen_at:
      '2026-09-10T10:10:00.000Z',
    resolved_at: null,
    last_notification_at: null,
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
  'operational incident notification policy',
  () => {
    test(
      'warning reminder cooldown is two hours',
      () => {
        expect(
          cooldownMsForSeverity(
            'warning'
          )
        ).toBe(
          WARNING_REMINDER_MS
        );

        expect(
          WARNING_REMINDER_MS
        ).toBe(
          2 * 60 * 60 * 1000
        );
      }
    );

    test(
      'critical reminder cooldown is thirty minutes',
      () => {
        expect(
          cooldownMsForSeverity(
            'critical'
          )
        ).toBe(
          CRITICAL_REMINDER_MS
        );

        expect(
          CRITICAL_REMINDER_MS
        ).toBe(
          30 * 60 * 1000
        );
      }
    );

    test(
      'new incident is immediately notifyable',
      () => {
        expect(
          notificationDecisionForIncident(
            incident(),
            {
              now:
                '2026-09-10T10:11:00.000Z',
            }
          )
        ).toMatchObject({
          notify: true,
          kind: 'opened',
          incident_id: 41,
          severity: 'warning',
        });
      }
    );

    test(
      'active warning remains quiet during cooldown',
      () => {
        expect(
          notificationDecisionForIncident(
            incident({
              last_notification_at:
                '2026-09-10T10:00:00.000Z',
              last_notification_severity:
                'warning',
              next_notification_at:
                '2026-09-10T12:00:00.000Z',
            }),
            {
              now:
                '2026-09-10T11:59:59.000Z',
            }
          )
        ).toEqual({
          notify: false,
          reason:
            'cooldown_active',
        });
      }
    );

    test(
      'active warning reminds when cooldown expires',
      () => {
        expect(
          notificationDecisionForIncident(
            incident({
              last_notification_at:
                '2026-09-10T10:00:00.000Z',
              last_notification_severity:
                'warning',
              next_notification_at:
                '2026-09-10T12:00:00.000Z',
            }),
            {
              now:
                '2026-09-10T12:00:00.000Z',
            }
          )
        ).toMatchObject({
          notify: true,
          kind: 'reminder',
          severity: 'warning',
        });
      }
    );

    test(
      'warning to critical escalation bypasses cooldown',
      () => {
        expect(
          notificationDecisionForIncident(
            incident({
              severity:
                'critical',
              alert_code:
                'provider_telecel_major_outage',
              last_notification_at:
                '2026-09-10T11:55:00.000Z',
              last_notification_severity:
                'warning',
              next_notification_at:
                '2026-09-10T13:55:00.000Z',
            }),
            {
              now:
                '2026-09-10T12:00:00.000Z',
            }
          )
        ).toMatchObject({
          notify: true,
          kind: 'escalated',
          severity:
            'critical',
        });
      }
    );

    test(
      'resolved notified incident gets one recovery notification',
      () => {
        expect(
          notificationDecisionForIncident(
            incident({
              resolved_at:
                '2026-09-10T12:03:00.000Z',
              last_notification_at:
                '2026-09-10T10:00:00.000Z',
              last_notification_severity:
                'warning',
            }),
            {
              now:
                '2026-09-10T12:04:00.000Z',
            }
          )
        ).toMatchObject({
          notify: true,
          kind:
            'recovered',
        });
      }
    );

    test(
      'recovery is not repeated',
      () => {
        expect(
          notificationDecisionForIncident(
            incident({
              resolved_at:
                '2026-09-10T12:03:00.000Z',
              last_notification_at:
                '2026-09-10T10:00:00.000Z',
              last_notification_severity:
                'warning',
              recovery_notification_at:
                '2026-09-10T12:04:00.000Z',
            }),
            {
              now:
                '2026-09-10T12:05:00.000Z',
            }
          )
        ).toEqual({
          notify: false,
          reason:
            'recovery_already_recorded',
        });
      }
    );

    test(
      'incident never notified while active does not emit recovery',
      () => {
        expect(
          notificationDecisionForIncident(
            incident({
              resolved_at:
                '2026-09-10T12:03:00.000Z',
            }),
            {
              now:
                '2026-09-10T12:05:00.000Z',
            }
          )
        ).toEqual({
          notify: false,
          reason:
            'never_notified_while_active',
        });
      }
    );

    test(
      'next reminder timestamp follows severity cooldown',
      () => {
        expect(
          nextNotificationAt({
            severity:
              'critical',
            notifiedAt:
              '2026-09-10T12:00:00.000Z',
          }).toISOString()
        ).toBe(
          '2026-09-10T12:30:00.000Z'
        );

        expect(
          nextNotificationAt({
            severity:
              'warning',
            notifiedAt:
              '2026-09-10T12:00:00.000Z',
          }).toISOString()
        ).toBe(
          '2026-09-10T14:00:00.000Z'
        );
      }
    );

    test(
      'records active notification state through supplied transaction client',
      async () => {
        const dbClient = {
          query:
            jest.fn()
              .mockResolvedValue({
                rows: [
                  {
                    id: 41,
                  },
                ],
              }),
        };

        const result =
          await recordNotificationDecision({
            dbClient,
            incidentId: 41,
            kind: 'opened',
            severity: 'warning',
            notifiedAt:
              '2026-09-10T12:00:00.000Z',
          });

        expect(result.recorded)
          .toBe(true);

        expect(
          dbClient.query
            .mock.calls[0][0]
        ).toContain(
          'last_notification_at'
        );

        expect(
          dbClient.query
            .mock.calls[0][1][3]
            .toISOString()
        ).toBe(
          '2026-09-10T14:00:00.000Z'
        );
      }
    );

    test(
      'records recovery only for resolved incident',
      async () => {
        const dbClient = {
          query:
            jest.fn()
              .mockResolvedValue({
                rows: [
                  {
                    id: 41,
                  },
                ],
              }),
        };

        const result =
          await recordNotificationDecision({
            dbClient,
            incidentId: 41,
            kind:
              'recovered',
            severity:
              'warning',
            notifiedAt:
              '2026-09-10T12:04:00.000Z',
          });

        expect(result.recorded)
          .toBe(true);

        expect(
          dbClient.query
            .mock.calls[0][0]
        ).toContain(
          'resolved_at IS NOT NULL'
        );

        expect(
          dbClient.query
            .mock.calls[0][0]
        ).toContain(
          'recovery_notification_at IS NULL'
        );
      }
    );
  }
);
