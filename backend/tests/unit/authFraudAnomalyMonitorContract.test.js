'use strict';

const fs = require('fs');
const path = require('path');

const monitorPath =
  path.join(
    __dirname,
    '../../src/services/fraudAnomalyMonitor.js',
  );

const source =
  fs.readFileSync(
    monitorPath,
    'utf8',
  );

describe(
  'auth fraud monitor contract',
  () => {
    test(
      'loads auth evaluator and event names',
      () => {
        expect(source).toContain(
          'evaluateAuthAnomalies',
        );

        expect(source).toContain(
          'AUTH_EVENT_NAMES',
        );
      },
    );

    test(
      'selects bounded candidates for all three auth rules',
      () => {
        expect(source).toContain(
          "'auth.login.failed'",
        );

        expect(source).toContain(
          "'auth.mfa.failed'",
        );

        expect(source).toContain(
          "'auth.password_reset.issued'",
        );

        expect(source).toContain(
          'LIMIT $3',
        );
      },
    );

    test(
      'requires user subject to match actor identity',
      () => {
        expect(source).toContain(
          "subject_type = 'user'",
        );

        expect(source).toContain(
          'subject_id =',
        );

        expect(source).toContain(
          'actor_user_id::text',
        );
      },
    );

    test(
      'combines transaction and auth signals without enforcement',
      () => {
        expect(source).toContain(
          'transactionEvaluation',
        );

        expect(source).toContain(
          'authEvaluation',
        );

        expect(source).toContain(
          "enforcement_action:",
        );

        expect(source).toContain(
          "'none'",
        );
      },
    );
  },
);
