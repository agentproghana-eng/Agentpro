const mockResendSend =
  jest.fn();

jest.mock(
  'resend',
  () => ({
    Resend: jest
      .fn()
      .mockImplementation(
        () => ({
          emails: {
            send: (...args) =>
              mockResendSend(...args),
          },
        }),
      ),
  }),
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  }),
);

const originalApiKey =
  process.env.RESEND_API_KEY;

const originalEmailFrom =
  process.env.EMAIL_FROM;

process.env.RESEND_API_KEY =
  're_test_agentpro_branding';

delete process.env.EMAIL_FROM;

const {
  sendWelcomeEmail,
  sendSubscriptionRenewalEmail,
  sendSubscriptionReminderEmail,
} = require(
  '../../src/services/emailService',
);

describe(
  'AgentPro professional email branding contracts',
  () => {
    beforeEach(() => {
      mockResendSend.mockReset();

      mockResendSend.mockResolvedValue({
        data: {
          id: 'email-test-id',
        },
        error: null,
      });
    });

    afterAll(() => {
      if (
        originalApiKey ===
        undefined
      ) {
        delete process.env
          .RESEND_API_KEY;
      } else {
        process.env.RESEND_API_KEY =
          originalApiKey;
      }

      if (
        originalEmailFrom ===
        undefined
      ) {
        delete process.env
          .EMAIL_FROM;
      } else {
        process.env.EMAIL_FROM =
          originalEmailFrom;
      }
    });

    test(
      'welcome email uses the canonical AgentPro brand system and escapes dynamic content',
      async () => {
        await sendWelcomeEmail(
          'owner@example.com',
          'Eric',
          '<script>alert("x")</script>',
        );

        expect(
          mockResendSend,
        ).toHaveBeenCalledTimes(1);

        const payload =
          mockResendSend
            .mock
            .calls[0][0];

        expect(
          payload.from,
        ).toBe(
          'AgentPro <onboarding@resend.dev>',
        );

        expect(
          payload.subject,
        ).toBe(
          'Welcome to AgentPro — Your Business Is Ready',
        );

        expect(
          payload.html,
        ).toContain(
          'One App. Every Business.',
        );

        expect(
          payload.html,
        ).toContain(
          'Intellicore Technology',
        );

        expect(
          payload.html,
        ).toContain(
          'AgentPro is a product of',
        );

        expect(
          payload.html,
        ).not.toContain(
          'One App. Every Mobile Money Business.',
        );

        expect(
          payload.html,
        ).not.toContain(
          '<script>alert("x")</script>',
        );

        expect(
          payload.html,
        ).toContain(
          '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
        );

        expect(
          payload.text,
        ).toContain(
          'One App. Every Business.',
        );
      },
    );

    test(
      'Business renewal sends a renewal confirmation rather than an onboarding message',
      async () => {
        await sendSubscriptionRenewalEmail(
          'owner@example.com',
          'Eric',
          'Agentpro',
          '10.00',
          new Date(
            '2026-12-05T08:36:37.632Z',
          ),
          {
            provider:
              'Paystack',
            paymentMethod:
              'mobile_money',
            reference:
              'APG-BSUB-RECEIPT-TEST',
            paidAt:
              new Date(
                '2026-08-26T18:04:42.000Z',
              ),
          },
        );

        const payload =
          mockResendSend
            .mock
            .calls[0][0];

        expect(
          payload.subject,
        ).toBe(
          'AgentPro — Business Plan Renewed',
        );

        expect(
          payload.html,
        ).toContain(
          'Business Plan renewed',
        );

        expect(
          payload.html,
        ).toContain(
          'GH₵10.00',
        );

        expect(
          payload.html,
        ).toContain(
          '05 December 2026',
        );

        expect(
          payload.html,
        ).toContain(
          'Paystack',
        );

        expect(
          payload.html,
        ).toContain(
          'Mobile Money',
        );

        expect(
          payload.html,
        ).toContain(
          'APG-BSUB-RECEIPT-TEST',
        );

        expect(
          payload.html,
        ).toContain(
          '26 August 2026',
        );

        expect(
          payload.text,
        ).toContain(
          'Payment provider: Paystack',
        );

        expect(
          payload.text,
        ).toContain(
          'Reference: APG-BSUB-RECEIPT-TEST',
        );

        expect(
          payload.html,
        ).not.toContain(
          'Account Approved',
        );

        expect(
          payload.html,
        ).not.toContain(
          'Welcome to AgentPro',
        );
      },
    );

    test(
      'renewal reminder does not hard-code a one-seat payment amount',
      async () => {
        await sendSubscriptionReminderEmail(
          'owner@example.com',
          'Eric',
          3,
          new Date(
            '2026-12-05T08:36:37.632Z',
          ),
        );

        const payload =
          mockResendSend
            .mock
            .calls[0][0];

        expect(
          payload.subject,
        ).toBe(
          'AgentPro — Business Plan Expires in 3 days',
        );

        expect(
          payload.html,
        ).toContain(
          'seat-based renewal amount',
        );

        expect(
          payload.html,
        ).not.toContain(
          'GH₵10',
        );
      },
    );
  },
);
