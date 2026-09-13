'use strict';

const {
  operationalAlertRecipient,
  emailDecisionForIncident,
  operationalEmailIdempotencyKey,
  processOperationalIncidentEmails,
} = require(
  '../../src/services/operationalIncidentEmailDelivery'
);

function criticalIncident(
  overrides = {}
) {
  return {
    id: 41,
    incident_key:
      'outbox:backlog',
    alert_code:
      'outbox_backlog_critical',
    component:
      'outbox',
    severity:
      'critical',
    first_seen_at:
      new Date(
        '2026-09-13T10:00:00.000Z'
      ),
    resolved_at: null,
    last_email_at: null,
    next_email_at: null,
    recovery_email_at: null,
    ...overrides,
  };
}

describe(
  'independent operational incident email',
  () => {
    test(
      'requires one operator mailbox or distribution list',
      () => {
        expect(
          operationalAlertRecipient({
            OPERATIONAL_ALERT_EMAIL_TO:
              'ops@example.com',
          })
        ).toBe(
          'ops@example.com'
        );

        expect(
          operationalAlertRecipient({})
        ).toBeNull();

        expect(() =>
          operationalAlertRecipient({
            OPERATIONAL_ALERT_EMAIL_TO:
              'one@example.com,two@example.com',
          })
        ).toThrow(
          'one mailbox or distribution-list address'
        );
      }
    );

    test(
      'first critical observation is independently email-due',
      () => {
        expect(
          emailDecisionForIncident(
            criticalIncident(),
            '2026-09-13T10:05:00.000Z'
          )
        ).toEqual({
          send: true,
          kind: 'opened',
        });
      }
    );

    test(
      'warning incident is not email-due',
      () => {
        expect(
          emailDecisionForIncident(
            criticalIncident({
              severity:
                'warning',
            }),
            '2026-09-13T10:05:00.000Z'
          )
        ).toEqual({
          send: false,
          reason:
            'not_critical',
        });
      }
    );

    test(
      'critical reminder uses its durable due timestamp as the idempotency boundary',
      () => {
        const incident =
          criticalIncident({
            last_email_at:
              new Date(
                '2026-09-13T10:00:00.000Z'
              ),
            next_email_at:
              new Date(
                '2026-09-13T10:30:00.000Z'
              ),
          });

        const decision =
          emailDecisionForIncident(
            incident,
            '2026-09-13T10:31:00.000Z'
          );

        expect(decision)
          .toEqual({
            send: true,
            kind: 'reminder',
          });

        expect(
          operationalEmailIdempotencyKey({
            incident,
            decision,
          })
        ).toBe(
          'operational-incident/41/critical-reminder/2026-09-13T10:30:00.000Z'
        );
      }
    );

    test(
      'recovery is emailed only when a critical incident email was previously sent',
      () => {
        expect(
          emailDecisionForIncident(
            criticalIncident({
              resolved_at:
                new Date(
                  '2026-09-13T11:00:00.000Z'
                ),
              last_email_at:
                new Date(
                  '2026-09-13T10:00:00.000Z'
                ),
              next_email_at:
                new Date(
                  '2026-09-13T10:30:00.000Z'
                ),
            }),
            '2026-09-13T11:01:00.000Z'
          )
        ).toEqual({
          send: true,
          kind: 'recovered',
        });

        expect(
          emailDecisionForIncident(
            criticalIncident({
              resolved_at:
                new Date(
                  '2026-09-13T11:00:00.000Z'
                ),
            }),
            '2026-09-13T11:01:00.000Z'
          ).send
        ).toBe(false);
      }
    );

    test(
      'successful provider send advances only email state',
      async () => {
        const queryFn =
          jest.fn()
            .mockResolvedValueOnce({
              rows: [
                criticalIncident(),
              ],
            })
            .mockResolvedValueOnce({
              rows: [
                {
                  id: 41,
                },
              ],
            });

        const sendFn =
          jest.fn()
            .mockResolvedValue({
              id:
                'resend-message-id',
            });

        const result =
          await processOperationalIncidentEmails({
            now:
              '2026-09-13T10:05:00.000Z',
            env: {
              OPERATIONAL_ALERT_EMAIL_TO:
                'ops@example.com',
            },
            queryFn,
            sendFn,
          });

        expect(sendFn)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              to:
                'ops@example.com',
              incidentId:
                '41',
              kind:
                'opened',
              idempotencyKey:
                'operational-incident/41/critical-opened',
            })
          );

        expect(
          queryFn.mock.calls[1][0]
        ).toContain(
          'last_email_at'
        );

        expect(result)
          .toEqual({
            considered: 1,
            attempted: 1,
            sent: 1,
            failed: 0,
            skipped_no_recipient:
              false,
          });
      }
    );

    test(
      'provider failure leaves email state due for retry',
      async () => {
        const queryFn =
          jest.fn()
            .mockResolvedValueOnce({
              rows: [
                criticalIncident(),
              ],
            });

        const sendFn =
          jest.fn()
            .mockRejectedValue(
              Object.assign(
                new Error(
                  'provider unavailable'
                ),
                {
                  code:
                    'EMAIL_PROVIDER_DOWN',
                }
              )
            );

        const result =
          await processOperationalIncidentEmails({
            now:
              '2026-09-13T10:05:00.000Z',
            env: {
              OPERATIONAL_ALERT_EMAIL_TO:
                'ops@example.com',
            },
            queryFn,
            sendFn,
          });

        expect(queryFn)
          .toHaveBeenCalledTimes(1);

        expect(result.failed)
          .toBe(1);

        expect(result.sent)
          .toBe(0);
      }
    );

    test(
      'missing operator configuration does not touch incident state',
      async () => {
        const queryFn =
          jest.fn();

        const sendFn =
          jest.fn();

        const result =
          await processOperationalIncidentEmails({
            env: {},
            queryFn,
            sendFn,
          });

        expect(queryFn)
          .not.toHaveBeenCalled();

        expect(sendFn)
          .not.toHaveBeenCalled();

        expect(
          result.skipped_no_recipient
        ).toBe(true);
      }
    );
  }
);
