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
      'strict successful delivery still persists the notification row',
      async () => {
        mockMessagingSend
          .mockResolvedValueOnce(
            'fcm-message-1'
          );

        mockQuery
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
        ).toHaveBeenCalledTimes(2);

        expect(
          mockQuery.mock
            .calls[1][0]
        ).toContain(
          'INSERT INTO notifications'
        );
      }
    );
  }
);
