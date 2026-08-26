const mockQuery = jest.fn();
const mockMessagingSend = jest.fn();
const mockLoggerError = jest.fn();

jest.mock(
  '../../src/config/database',
  () => ({
    query: (...args) =>
      mockQuery(...args),
  })
);

jest.mock(
  '../../src/config/firebase',
  () => ({
    getMessaging: () => ({
      send:
        (...args) =>
          mockMessagingSend(
            ...args
          ),
    }),
  })
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      error:
        (...args) =>
          mockLoggerError(
            ...args
          ),
      warn: jest.fn(),
      info: jest.fn(),
    },
  })
);

const {
  sendToUser,
  sendTransactionNotification,
} = require(
  '../../src/services/notificationService'
);

function transaction() {
  return {
    id:
      '11111111-1111-1111-1111-111111111111',
    amount:
      '25.00',
    transaction_type:
      'cash_in',
    reference:
      'APG-STRICT-001',
    failure_reason:
      null,
  };
}

describe(
  'notification service strict delivery',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockQuery
        .mockResolvedValue({
          rows: [
            {
              fcm_token:
                'test-fcm-token',
            },
          ],
        });
    });

    test(
      'existing best-effort callers still absorb FCM failures',
      async () => {
        const error =
          Object.assign(
            new Error(
              'FCM unavailable'
            ),
            {
              code:
                'messaging/internal-error',
            }
          );

        mockMessagingSend
          .mockRejectedValueOnce(
            error
          );

        await expect(
          sendTransactionNotification(
            'agent-1',
            {
              type:
                'transaction_success',
              transaction:
                transaction(),
            }
          )
        ).resolves
          .toBeUndefined();

        expect(
          mockLoggerError
        ).toHaveBeenCalled();
      }
    );

    test(
      'strict outbox delivery propagates FCM failures',
      async () => {
        const error =
          Object.assign(
            new Error(
              'FCM unavailable'
            ),
            {
              code:
                'messaging/internal-error',
            }
          );

        mockMessagingSend
          .mockRejectedValueOnce(
            error
          );

        await expect(
          sendTransactionNotification(
            'agent-1',
            {
              type:
                'transaction_success',
              transaction:
                transaction(),
            },
            {
              throwOnError:
                true,
            }
          )
        ).rejects.toBe(
          error
        );

        expect(
          mockLoggerError
        ).toHaveBeenCalled();
      }
    );

    test(
      'existing delivery key suppresses a second Firebase send',
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                fcm_message_id:
                  'fcm-message-existing',
              },
            ],
          });

        await expect(
          sendTransactionNotification(
            'agent-1',
            {
              type:
                'transaction_success',
              transaction:
                transaction(),
            },
            {
              throwOnError:
                true,
              deliveryKey:
                'transaction:11111111:completion:success',
            }
          )
        ).resolves.toBe(
          'fcm-message-existing'
        );

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(1);

        expect(
          mockQuery.mock.calls[0][0]
        ).toContain(
          'WHERE delivery_key = $1'
        );

        expect(
          mockQuery.mock.calls[0][1]
        ).toEqual([
          'transaction:11111111:completion:success',
          'agent-1',
        ]);

        expect(
          mockMessagingSend
        ).not.toHaveBeenCalled();

        expect(
          mockQuery.mock.calls.some(
            ([sql]) =>
              sql.includes(
                'SELECT fcm_token FROM users'
              )
          )
        ).toBe(false);

        expect(
          mockQuery.mock.calls.some(
            ([sql]) =>
              sql.includes(
                'INSERT INTO notifications'
              )
          )
        ).toBe(false);
      }
    );

    test(
      'strict successful delivery persists before FCM and records delivery metadata',
      async () => {
        mockMessagingSend
          .mockResolvedValueOnce(
            'fcm-message-1'
          );

        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  'notification-1',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                fcm_token:
                  'test-fcm-token',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [],
          });

        await expect(
          sendTransactionNotification(
            'agent-1',
            {
              type:
                'transaction_success',
              transaction:
                transaction(),
            },
            {
              throwOnError:
                true,
            }
          )
        ).resolves.toBe(
          'fcm-message-1'
        );

        expect(
          mockMessagingSend
        ).toHaveBeenCalledTimes(1);

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(3);

        expect(
          mockQuery.mock.calls[0][0]
        ).toContain(
          'INSERT INTO notifications'
        );

        expect(
          mockQuery.mock.calls[1][0]
        ).toContain(
          'SELECT fcm_token'
        );

        expect(
          mockQuery.mock.calls[2][0]
        ).toContain(
          'UPDATE notifications'
        );
      }
    );

    test(
      'notification persists when the user has no FCM token',
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  'notification-no-token',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [],
          });

        await expect(
          sendToUser(
            'user-no-token',
            {
              type:
                'personal_subscription_rejected',
              title:
                'Payment Not Verified',
              body:
                'Your payment could not be verified.',
              data: {},
            }
          )
        ).resolves
          .toBeUndefined();

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(2);

        expect(
          mockQuery.mock.calls[0][0]
        ).toContain(
          'INSERT INTO notifications'
        );

        expect(
          mockQuery.mock.calls[1][0]
        ).toContain(
          'SELECT fcm_token'
        );

        expect(
          mockMessagingSend
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'FCM failure leaves persisted notification and strict mode propagates',
      async () => {
        const error =
          Object.assign(
            new Error(
              'FCM unavailable'
            ),
            {
              code:
                'messaging/internal-error',
            }
          );

        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  'notification-failed-push',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                fcm_token:
                  'test-fcm-token',
              },
            ],
          });

        mockMessagingSend
          .mockRejectedValueOnce(
            error
          );

        await expect(
          sendToUser(
            'user-1',
            {
              type:
                'transaction_success',
              title:
                'Transaction Successful',
              body:
                'Completed.',
              data: {},
            },
            {
              throwOnError:
                true,
            }
          )
        ).rejects.toBe(
          error
        );

        expect(
          mockQuery.mock.calls[0][0]
        ).toContain(
          'INSERT INTO notifications'
        );
      }
    );

    test(
      'persisted delivery key without FCM message retries push',
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  'notification-existing',
                fcm_message_id:
                  null,
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                fcm_token:
                  'test-fcm-token',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [],
          });

        mockMessagingSend
          .mockResolvedValueOnce(
            'fcm-message-retry'
          );

        await expect(
          sendToUser(
            'user-1',
            {
              type:
                'transaction_success',
              title:
                'Transaction Successful',
              body:
                'Completed.',
              data: {},
            },
            {
              throwOnError:
                true,
              deliveryKey:
                'transaction:retry:success',
            }
          )
        ).resolves.toBe(
          'fcm-message-retry'
        );

        expect(
          mockMessagingSend
        ).toHaveBeenCalledTimes(1);

        expect(
          mockQuery.mock.calls[0][0]
        ).toContain(
          'WHERE delivery_key = $1'
        );

        expect(
          mockQuery.mock.calls.some(
            ([sql]) =>
              sql.includes(
                'INSERT INTO notifications'
              )
          )
        ).toBe(false);
      }
    );

    test.each([
      [
        'transaction_success',
        'Balance enquiry completed. Ref: APG-BALANCE-001',
      ],
      [
        'transaction_failed',
        'Balance enquiry failed.',
      ],
      [
        'transaction_pending_confirmation',
        'Balance enquiry — outcome unconfirmed. ' +
          'Check your transaction history. ' +
          'Ref: APG-BALANCE-001',
      ],
    ])(
      'balance enquiry %s notification omits fake zero amount',
      async (type, expectedBody) => {
        mockMessagingSend.mockResolvedValueOnce(
          'fcm-message-balance-enquiry'
        );

        await sendTransactionNotification(
          'agent-1',
          {
            type,
            transaction: {
              ...transaction(),
              amount: '0.00',
              transaction_type: 'balance_enquiry',
              reference: 'APG-BALANCE-001',
            },
          }
        );

        expect(mockMessagingSend).toHaveBeenCalledTimes(1);

        const message =
          mockMessagingSend.mock.calls[0][0];

        expect(message.notification.body).toBe(
          expectedBody
        );

        expect(message.notification.body).not.toContain(
          'GH₵0.00'
        );

        expect(message.data.amount).toBe(
          '0.00'
        );

        if (
          type ===
          'transaction_pending_confirmation'
        ) {
          expect(message.notification.body).not.toContain(
            'ask the customer'
          );
        }
      }
    );

    test(
      'monetary pending notification retains amount and customer verification advice',
      async () => {
        mockMessagingSend.mockResolvedValueOnce(
          'fcm-message-cash-in'
        );

        await sendTransactionNotification(
          'agent-1',
          {
            type:
              'transaction_pending_confirmation',
            transaction:
              transaction(),
          }
        );

        expect(mockMessagingSend).toHaveBeenCalledTimes(1);

        const message =
          mockMessagingSend.mock.calls[0][0];

        expect(message.notification.body).toContain(
          'GH₵25.00 Cash In'
        );

        expect(message.notification.body).toContain(
          'ask the customer before retrying'
        );
      }
    );

  }
);
