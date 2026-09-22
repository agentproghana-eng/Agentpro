const {
  TEST_EMAIL_FROM,
  resolveEmailFrom,
} = require(
  '../../src/utils/emailSender'
);

describe(
  'production email sender safety',
  () => {
    test(
      'non-production keeps the Resend test sender fallback',
      () => {
        expect(
          resolveEmailFrom({
            NODE_ENV: 'test',
            RESEND_API_KEY: 're_test',
          })
        ).toBe(
          TEST_EMAIL_FROM
        );
      },
    );

    test(
      'production Resend delivery requires EMAIL_FROM',
      () => {
        expect(() =>
          resolveEmailFrom({
            NODE_ENV:
              'production',
            RESEND_API_KEY:
              're_live',
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'EMAIL_FROM_REQUIRED_IN_PRODUCTION',
          })
        );
      },
    );

    test(
      'production rejects the Resend test sender',
      () => {
        expect(() =>
          resolveEmailFrom({
            NODE_ENV:
              'production',
            RESEND_API_KEY:
              're_live',
            EMAIL_FROM:
              'AgentPro <onboarding@resend.dev>',
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'EMAIL_FROM_TEST_SENDER_FORBIDDEN',
          })
        );
      },
    );

    test(
      'production accepts a configured custom sender',
      () => {
        expect(
          resolveEmailFrom({
            NODE_ENV:
              'production',
            RESEND_API_KEY:
              're_live',
            EMAIL_FROM:
              'AgentPro <no-reply@agentproghana.com>',
          })
        ).toBe(
          'AgentPro <no-reply@agentproghana.com>'
        );
      },
    );

    test(
      'production without Resend remains non-sending and does not require EMAIL_FROM',
      () => {
        expect(
          resolveEmailFrom({
            NODE_ENV:
              'production',
          })
        ).toBe(
          TEST_EMAIL_FROM
        );
      },
    );
  },
);
