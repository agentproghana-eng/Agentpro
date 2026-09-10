'use strict';

const mockSendToUser =
  jest.fn();

jest.mock(
  '../../src/config/database',
  () => ({
    query:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/notificationService',
  () => ({
    sendToUser:
      (...args) =>
        mockSendToUser(
          ...args
        ),
    sendTransactionNotification:
      jest.fn(),
    sendAdNotification:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/smsService',
  () => ({
    sendAdPaymentConfirmedSMS:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/emailService',
  () => ({
    sendAdPaymentConfirmedEmail:
      jest.fn(),
  })
);

const {
  dispatchOutboxEvent,
} = require(
  '../../src/services/outboxDispatcher'
);

describe(
  'operational incident outbox dispatcher',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockSendToUser
        .mockResolvedValue(
          'fcm-message-id'
        );
    });

    test(
      'dispatches operational incident through durable user notification path',
      async () => {
        const event = {
          event_type:
            'notification.operational_incident',
          dedupe_key:
            'operational-incident:41:opened:time:user-a',
          payload: {
            user_id:
              'user-a',
            incident_id:
              '41',
            incident_key:
              'provider:telecel',
            alert_code:
              'provider_telecel_degraded',
            component:
              'provider_health',
            severity:
              'warning',
            kind:
              'opened',
            title:
              'AgentPro Operational Incident',
            body:
              'Warning: provider health requires attention.',
          },
        };

        await dispatchOutboxEvent(
          event
        );

        expect(
          mockSendToUser
        ).toHaveBeenCalledWith(
          'user-a',
          {
            type:
              'operational_incident',
            title:
              'AgentPro Operational Incident',
            body:
              'Warning: provider health requires attention.',
            data: {
              incident_id:
                '41',
              incident_key:
                'provider:telecel',
              alert_code:
                'provider_telecel_degraded',
              component:
                'provider_health',
              severity:
                'warning',
              kind:
                'opened',
            },
          },
          {
            throwOnError:
              true,
            deliveryKey:
              'operational-incident:41:opened:time:user-a',
          }
        );
      }
    );

    test(
      'rejects invalid operational incident severity',
      async () => {
        await expect(
          dispatchOutboxEvent({
            event_type:
              'notification.operational_incident',
            dedupe_key:
              'key',
            payload: {
              user_id:
                'user-a',
              incident_id:
                '41',
              incident_key:
                'provider:telecel',
              alert_code:
                'provider_telecel_degraded',
              component:
                'provider_health',
              severity:
                'fatal',
              kind:
                'opened',
              title:
                'title',
              body:
                'body',
            },
          })
        ).rejects.toMatchObject({
          code:
            'OUTBOX_INVALID_EVENT_PAYLOAD',
        });
      }
    );

    test(
      'rejects invalid notification transition kind',
      async () => {
        await expect(
          dispatchOutboxEvent({
            event_type:
              'notification.operational_incident',
            dedupe_key:
              'key',
            payload: {
              user_id:
                'user-a',
              incident_id:
                '41',
              incident_key:
                'provider:telecel',
              alert_code:
                'provider_telecel_degraded',
              component:
                'provider_health',
              severity:
                'warning',
              kind:
                'unknown',
              title:
                'title',
              body:
                'body',
            },
          })
        ).rejects.toMatchObject({
          code:
            'OUTBOX_INVALID_EVENT_PAYLOAD',
        });
      }
    );
  }
);
