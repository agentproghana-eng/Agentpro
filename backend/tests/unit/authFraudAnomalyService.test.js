'use strict';

const {
  AUTH_RULES,
  AUTH_EVENT_NAMES,
  MAX_EVIDENCE_IDS,
  evaluateAuthAnomalies,
} = require(
  '../../src/services/authFraudAnomalyService'
);

const {
  normalizeSignal,
} = require(
  '../../src/services/fraudSignalService'
);

const NOW =
  new Date(
    '2026-09-14T16:30:00.000Z',
  );

function event({
  id,
  eventName,
  userId =
    '11111111-1111-4111-8111-111111111111',
  companyId =
    '22222222-2222-4222-8222-222222222222',
  minutesAgo = 0,
}) {
  return {
    id: String(id),
    event_name: eventName,
    actor_user_id: userId,
    company_id: companyId,
    subject_type: 'user',
    subject_id: userId,
    correlation_id:
      `33333333-3333-4333-8333-${String(id).padStart(12, '0').slice(-12)}`,
    attributes: {},
    occurred_at:
      new Date(
        NOW.getTime() -
          minutesAgo *
            60 *
            1000,
      ).toISOString(),
  };
}

describe(
  'auth fraud anomaly service',
  () => {
    test(
      'exposes only the intended auth event names',
      () => {
        expect(
          new Set(AUTH_EVENT_NAMES),
        ).toEqual(
          new Set([
            'auth.login.failed',
            'auth.mfa.failed',
            'auth.password_reset.issued',
          ]),
        );
      },
    );

    test(
      'does not signal ordinary auth activity',
      () => {
        const result =
          evaluateAuthAnomalies({
            events: [
              event({
                id: 1,
                eventName:
                  'auth.login.failed',
              }),
              event({
                id: 2,
                eventName:
                  'auth.password_reset.issued',
              }),
            ],
            now: NOW,
          });

        expect(result.signal_count)
          .toBe(0);

        expect(
          result.enforcement_action,
        ).toBe('none');
      },
    );

    test(
      'detects repeated failed logins',
      () => {
        const threshold =
          AUTH_RULES
            .auth_login_failure_burst_10m
            .threshold;

        const events =
          Array.from(
            { length: threshold },
            (_, index) =>
              event({
                id: index + 1,
                eventName:
                  'auth.login.failed',
                minutesAgo:
                  index,
              }),
          );

        const result =
          evaluateAuthAnomalies({
            events,
            now: NOW,
          });

        const signal =
          result.signals.find(
            item =>
              item.rule_id ===
              'auth_login_failure_burst_10m',
          );

        expect(signal)
          .toBeDefined();

        expect(signal.risk_score)
          .toBe(75);

        expect(signal.signal_type)
          .toBe('auth_anomaly');
      },
    );

    test(
      'detects MFA failures as critical',
      () => {
        const threshold =
          AUTH_RULES
            .auth_mfa_failure_burst_10m
            .threshold;

        const result =
          evaluateAuthAnomalies({
            events:
              Array.from(
                { length: threshold },
                (_, index) =>
                  event({
                    id: index + 20,
                    eventName:
                      'auth.mfa.failed',
                  }),
              ),
            now: NOW,
          });

        expect(
          result.highest_severity,
        ).toBe('critical');

        expect(
          result.highest_risk_score,
        ).toBe(90);
      },
    );

    test(
      'detects repeated password reset issuance',
      () => {
        const threshold =
          AUTH_RULES
            .auth_password_reset_burst_10m
            .threshold;

        const result =
          evaluateAuthAnomalies({
            events:
              Array.from(
                { length: threshold },
                (_, index) =>
                  event({
                    id: index + 40,
                    eventName:
                      'auth.password_reset.issued',
                  }),
              ),
            now: NOW,
          });

        expect(
          result.signals.some(
            signal =>
              signal.rule_id ===
              'auth_password_reset_burst_10m',
          ),
        ).toBe(true);
      },
    );

    test(
      'does not mix users',
      () => {
        const threshold =
          AUTH_RULES
            .auth_login_failure_burst_10m
            .threshold;

        const events = [];

        for (
          let index = 0;
          index < threshold - 1;
          index += 1
        ) {
          events.push(
            event({
              id: index + 60,
              eventName:
                'auth.login.failed',
            }),
          );

          events.push(
            event({
              id: index + 80,
              eventName:
                'auth.login.failed',
              userId:
                'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            }),
          );
        }

        expect(
          evaluateAuthAnomalies({
            events,
            now: NOW,
          }).signal_count,
        ).toBe(0);
      },
    );

    test(
      'ignores stale and wrong-subject events',
      () => {
        const threshold =
          AUTH_RULES
            .auth_mfa_failure_burst_10m
            .threshold;

        const events =
          Array.from(
            { length: threshold },
            (_, index) => ({
              ...event({
                id: index + 100,
                eventName:
                  'auth.mfa.failed',
                minutesAgo: 30,
              }),
              subject_type:
                index === 0
                  ? 'transaction'
                  : 'user',
            }),
          );

        expect(
          evaluateAuthAnomalies({
            events,
            now: NOW,
          }).signal_count,
        ).toBe(0);
      },
    );

    test(
      'keeps evidence bounded and identity-safe',
      () => {
        const threshold =
          AUTH_RULES
            .auth_login_failure_burst_10m
            .threshold;

        const result =
          evaluateAuthAnomalies({
            events:
              Array.from(
                { length: threshold },
                (_, index) =>
                  event({
                    id: index + 120,
                    eventName:
                      'auth.login.failed',
                  }),
              ),
            now: NOW,
          });

        const signal =
          result.signals[0];

        expect(
          signal.evidence
            .event_ids.length,
        ).toBeLessThanOrEqual(
          MAX_EVIDENCE_IDS,
        );

        expect(
          signal.evidence,
        ).not.toHaveProperty(
          'email',
        );

        expect(
          signal.evidence,
        ).not.toHaveProperty(
          'phone',
        );

        expect(
          signal.evidence,
        ).not.toHaveProperty(
          'ip_address',
        );

        expect(
          signal.enforcement_action,
        ).toBeUndefined();

        expect(
          result.enforcement_action,
        ).toBe('none');
      },
    );

    test(
      'creates deterministic bucketed dedupe keys',
      () => {
        const threshold =
          AUTH_RULES
            .auth_login_failure_burst_10m
            .threshold;

        const events =
          Array.from(
            { length: threshold },
            (_, index) =>
              event({
                id: index + 160,
                eventName:
                  'auth.login.failed',
              }),
          );

        const first =
          evaluateAuthAnomalies({
            events,
            now: NOW,
          });

        const second =
          evaluateAuthAnomalies({
            events,
            now: NOW,
          });

        expect(
          first.signals[0]
            .dedupe_key,
        ).toBe(
          second.signals[0]
            .dedupe_key,
        );
      },
    );

    test(
      'produces signals accepted by durable fraud persistence normalization',
      () => {
        const scenarios = [
          {
            rule:
              AUTH_RULES
                .auth_login_failure_burst_10m,
            eventName:
              'auth.login.failed',
            idStart: 200,
          },
          {
            rule:
              AUTH_RULES
                .auth_mfa_failure_burst_10m,
            eventName:
              'auth.mfa.failed',
            idStart: 220,
          },
          {
            rule:
              AUTH_RULES
                .auth_password_reset_burst_10m,
            eventName:
              'auth.password_reset.issued',
            idStart: 240,
          },
        ];

        for (const scenario of scenarios) {
          const evaluation =
            evaluateAuthAnomalies({
              events:
                Array.from(
                  {
                    length:
                      scenario.rule
                        .threshold,
                  },
                  (_, index) =>
                    event({
                      id:
                        scenario.idStart +
                        index,
                      eventName:
                        scenario.eventName,
                    }),
                ),
              now: NOW,
            });

          expect(
            evaluation
              .enforcement_action,
          ).toBe('none');

          expect(
            evaluation.signal_count,
          ).toBe(1);

          const normalized =
            normalizeSignal(
              evaluation.signals[0],
            );

          expect(
            normalized.ruleId,
          ).toBe(
            scenario.rule.rule_id,
          );

          expect(
            normalized.actorUserId,
          ).toBe(
            '11111111-1111-4111-8111-111111111111',
          );

          expect(
            JSON.parse(
              normalized.evidence,
            ),
          ).toEqual(
            expect.objectContaining({
              event_ids:
                expect.any(Array),
              correlation_ids:
                expect.any(Array),
            }),
          );
        }
      },
    );

    test(
      'rejects invalid evaluation time',
      () => {
        expect(
          () =>
            evaluateAuthAnomalies({
              events: [],
              now: 'invalid',
            }),
        ).toThrow(
          'Invalid auth anomaly evaluation time',
        );
      },
    );
  },
);
