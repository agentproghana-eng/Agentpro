const mockVerify = jest.fn();
const mockReceiveGet = jest.fn();
const mockAttachmentList =
  jest.fn();
const mockSend = jest.fn();

const mockResendConstructor =
  jest.fn((apiKey) => ({
    webhooks: {
      verify: mockVerify,
    },
    emails: {
      send: mockSend,
      receiving: {
        get: mockReceiveGet,
        attachments: {
          list:
            mockAttachmentList,
        },
      },
    },
    __apiKey: apiKey,
  }));

jest.mock(
  'resend',
  () => ({
    Resend:
      mockResendConstructor,
  })
);

process.env.RESEND_API_KEY =
  're_send_test';
process.env.RESEND_RECEIVING_API_KEY =
  're_receive_test';
process.env
  .RESEND_INBOUND_WEBHOOK_SECRET =
  'whsec_test';
process.env
  .SUPPORT_INBOUND_FORWARD_TO =
  'agentproghana@gmail.com';
process.env.SUPPORT_INBOUND_ADDRESS =
  'support@agentproghana.com';
process.env.EMAIL_FROM =
  'AgentPro <no-reply@agentproghana.com>';

const request = require('supertest');
const app = require('../../server');

describe(
  'AgentPro Resend inbound support webhook',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockVerify.mockReturnValue({
        type: 'email.received',
        data: {
          email_id:
            'received-email-1',
          from:
            'Customer <customer@example.com>',
          to: [
            'support@agentproghana.com',
          ],
          subject:
            'Need help',
          attachments: [],
        },
      });

      mockReceiveGet.mockResolvedValue({
        data: {
          from:
            'Customer <customer@example.com>',
          subject:
            'Need help',
          text:
            'Please help with my account.',
          html: null,
        },
        error: null,
      });

      mockAttachmentList
        .mockResolvedValue({
          data: [],
          error: null,
        });

      mockSend.mockResolvedValue({
        data: {
          id:
            'forwarded-email-1',
        },
        error: null,
      });
    });

    test(
      'verifies and forwards support mail outside client compatibility enforcement',
      async () => {
        const response =
          await request(app)
            .post(
              '/api/v1/webhooks/resend-inbound'
            )
            .set(
              'svix-id',
              'msg_test'
            )
            .set(
              'svix-timestamp',
              '1234567890'
            )
            .set(
              'svix-signature',
              'v1,test'
            )
            .send({
              type:
                'email.received',
            });

        expect(
          response.status
        ).toBe(200);

        expect(
          mockResendConstructor
        ).toHaveBeenCalledWith(
          're_receive_test'
        );

        expect(
          mockResendConstructor
        ).toHaveBeenCalledWith(
          're_send_test'
        );

        expect(
          mockVerify
        ).toHaveBeenCalledTimes(1);

        expect(
          mockVerify
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            payload:
              expect.any(String),
            headers: {
              id:
                'msg_test',
              timestamp:
                '1234567890',
              signature:
                'v1,test',
            },
            webhookSecret:
              'whsec_test',
          })
        );

        expect(
          mockReceiveGet
        ).toHaveBeenCalledWith(
          'received-email-1'
        );

        expect(
          mockSend
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            from:
              'AgentPro <no-reply@agentproghana.com>',
            to: [
              'agentproghana@gmail.com',
            ],
            subject:
              '[AgentPro Support] Need help',
            replyTo:
              'Customer <customer@example.com>',
            text:
              expect.stringContaining(
                'Please help with my account.'
              ),
          }),
          {
            idempotencyKey:
              'support-inbound-forward-received-email-1',
          }
        );
      }
    );

    test(
      'rejects an invalid webhook signature',
      async () => {
        mockVerify.mockImplementation(
          () => {
            throw new Error(
              'invalid signature'
            );
          }
        );

        const response =
          await request(app)
            .post(
              '/api/v1/webhooks/resend-inbound'
            )
            .set(
              'svix-id',
              'msg_test'
            )
            .set(
              'svix-timestamp',
              '1234567890'
            )
            .set(
              'svix-signature',
              'v1,bad'
            )
            .send({
              type:
                'email.received',
            });

        expect(
          response.status
        ).toBe(400);

        expect(
          mockSend
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'ignores mail for other inbound aliases',
      async () => {
        mockVerify.mockReturnValue({
          type:
            'email.received',
          data: {
            email_id:
              'received-email-2',
            from:
              'Sender <sender@example.com>',
            to: [
              'other@agentproghana.com',
            ],
            subject:
              'Other alias',
            attachments: [],
          },
        });

        const response =
          await request(app)
            .post(
              '/api/v1/webhooks/resend-inbound'
            )
            .set(
              'svix-id',
              'msg_test'
            )
            .set(
              'svix-timestamp',
              '1234567890'
            )
            .set(
              'svix-signature',
              'v1,test'
            )
            .send({
              type:
                'email.received',
            });

        expect(
          response.status
        ).toBe(200);

        expect(
          mockReceiveGet
        ).not.toHaveBeenCalled();

        expect(
          mockSend
        ).not.toHaveBeenCalled();
      }
    );
  }
);
