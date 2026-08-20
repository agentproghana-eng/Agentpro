const mockSendTransactionNotification =
  jest.fn();

jest.mock(
  '../../src/services/notificationService',
  () => ({
    sendTransactionNotification:
      (...args) =>
        mockSendTransactionNotification(
          ...args
        ),
  })
);

const {
  dispatchOutboxEvent,
} = require(
  '../../src/services/outboxDispatcher'
);

describe(
  'outbox dispatcher',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockSendTransactionNotification
        .mockResolvedValue(
          'message-id'
        );
    });

    test(
      'dispatches transaction completion using strict delivery mode',
      async () => {
        const event = {
          event_type:
            'notification.transaction.completed',
          payload: {
            agent_id:
              'agent-1',
            type:
              'transaction_success',
            transaction: {
              id:
                '11111111-1111-1111-1111-111111111111',
              amount:
                '25.00',
              transaction_type:
                'cash_in',
              reference:
                'APG-OUTBOX-001',
              failure_reason:
                null,
            },
          },
        };

        await expect(
          dispatchOutboxEvent(
            event
          )
        ).resolves.toBe(
          'message-id'
        );

        expect(
          mockSendTransactionNotification
        ).toHaveBeenCalledWith(
          'agent-1',
          {
            type:
              'transaction_success',
            transaction:
              event.payload
                .transaction,
          },
          {
            throwOnError: true,
          }
        );
      }
    );

    test(
      'propagates delivery failure to the worker',
      async () => {
        const deliveryError =
          Object.assign(
            new Error(
              'FCM unavailable'
            ),
            {
              code:
                'messaging/internal-error',
            }
          );

        mockSendTransactionNotification
          .mockRejectedValueOnce(
            deliveryError
          );

        await expect(
          dispatchOutboxEvent({
            event_type:
              'notification.transaction.completed',
            payload: {
              agent_id:
                'agent-1',
              type:
                'transaction_failed',
              transaction: {
                id:
                  '11111111-1111-1111-1111-111111111111',
                amount:
                  '25.00',
                transaction_type:
                  'cash_in',
                reference:
                  'APG-OUTBOX-002',
                failure_reason:
                  'network_failure',
              },
            },
          })
        ).rejects.toBe(
          deliveryError
        );
      }
    );

    test(
      'rejects malformed transaction payload before delivery',
      async () => {
        await expect(
          dispatchOutboxEvent({
            event_type:
              'notification.transaction.completed',
            payload: {
              agent_id:
                'agent-1',
              type:
                'transaction_success',
              transaction: {},
            },
          })
        ).rejects.toMatchObject({
          code:
            'OUTBOX_INVALID_EVENT_PAYLOAD',
        });

        expect(
          mockSendTransactionNotification
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'rejects an unknown transaction notification type',
      async () => {
        await expect(
          dispatchOutboxEvent({
            event_type:
              'notification.transaction.completed',
            payload: {
              agent_id:
                'agent-1',
              type:
                'made_up_result',
              transaction: {
                id:
                  '11111111-1111-1111-1111-111111111111',
                transaction_type:
                  'cash_in',
              },
            },
          })
        ).rejects.toMatchObject({
          code:
            'OUTBOX_INVALID_EVENT_PAYLOAD',
        });

        expect(
          mockSendTransactionNotification
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'unknown event types fail closed',
      async () => {
        await expect(
          dispatchOutboxEvent({
            event_type:
              'notification.unknown',
            payload: {},
          })
        ).rejects.toMatchObject({
          code:
            'OUTBOX_UNSUPPORTED_EVENT_TYPE',
        });
      }
    );
  }
);
