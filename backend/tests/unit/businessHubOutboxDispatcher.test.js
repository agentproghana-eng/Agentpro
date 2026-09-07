const mockQuery = jest.fn();

const mockSendAdNotification = jest.fn();

const mockSendAdPaymentConfirmedSMS = jest.fn();

const mockSendAdPaymentConfirmedEmail = jest.fn();

jest.mock(
  "../../src/config/database",
  () => ({
    query: (...args) =>
      mockQuery(...args),
  })
);

jest.mock(
  "../../src/services/notificationService",
  () => ({
    sendTransactionNotification:
      jest.fn(),
    sendAdNotification:
      (...args) =>
        mockSendAdNotification(...args),
  })
);

jest.mock(
  "../../src/services/smsService",
  () => ({
    sendAdPaymentConfirmedSMS:
      (...args) =>
        mockSendAdPaymentConfirmedSMS(
          ...args
        ),
  })
);

jest.mock(
  "../../src/services/emailService",
  () => ({
    sendAdPaymentConfirmedEmail:
      (...args) =>
        mockSendAdPaymentConfirmedEmail(
          ...args
        ),
  })
);

const {
  dispatchOutboxEvent,
} = require(
  "../../src/services/outboxDispatcher"
);

const AD_ID =
  "11111111-1111-4111-8111-111111111111";

const USER_ID =
  "22222222-2222-4222-8222-222222222222";

function event(eventType, dedupeKey) {
  return {
    event_type: eventType,
    dedupe_key: dedupeKey,
    payload: {
      user_id: USER_ID,
      ad_id: AD_ID,
      ad_title: "Test listing",
      amount: "25.00",
    },
  };
}

describe(
  "Business Hub outbox delivery",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockSendAdNotification
        .mockResolvedValue(
          "fcm-message"
        );

      mockSendAdPaymentConfirmedSMS
        .mockResolvedValue(
          "sms-message"
        );

      mockSendAdPaymentConfirmedEmail
        .mockResolvedValue(
          "email-message"
        );
    });

    test(
      "dispatches payment-required AgentPro notification strictly",
      async () => {
        const item = event(
          "notification.business_hub.payment_required",
          `business-hub:payment-required:${AD_ID}:v1`
        );

        await dispatchOutboxEvent(item);

        expect(
          mockSendAdNotification
        ).toHaveBeenCalledWith(
          USER_ID,
          {
            type:
              "ad_payment_required",
            adId: AD_ID,
            adTitle:
              "Test listing",
            amount:
              "25.00",
          },
          {
            throwOnError: true,
            deliveryKey:
              item.dedupe_key,
          }
        );
      }
    );

    test(
      "dispatches payment-confirmed AgentPro notification strictly",
      async () => {
        const item = event(
          "notification.business_hub.payment_confirmed",
          `business-hub:payment-confirmed:app:${AD_ID}:payment-1`
        );

        await dispatchOutboxEvent(item);

        expect(
          mockSendAdNotification
        ).toHaveBeenCalledWith(
          USER_ID,
          {
            type:
              "ad_payment_confirmed",
            adId: AD_ID,
            adTitle:
              "Test listing",
            amount:
              "25.00",
          },
          {
            throwOnError: true,
            deliveryKey:
              item.dedupe_key,
          }
        );
      }
    );

    test(
      "dispatches confirmed SMS with authoritative amount",
      async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              first_name: "Ama",
              email:
                "ama@example.com",
              phone:
                "0240000000",
            },
          ],
        });

        await dispatchOutboxEvent(
          event(
            "sms.business_hub.payment_confirmed",
            `business-hub:payment-confirmed:sms:${AD_ID}:payment-1`
          )
        );

        expect(
          mockSendAdPaymentConfirmedSMS
        ).toHaveBeenCalledWith(
          "0240000000",
          "Ama",
          "Test listing",
          "25.00"
        );
      }
    );

    test(
      "dispatches confirmed email with authoritative amount",
      async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              first_name: "Ama",
              email:
                "ama@example.com",
              phone:
                "0240000000",
            },
          ],
        });

        await dispatchOutboxEvent(
          event(
            "email.business_hub.payment_confirmed",
            `business-hub:payment-confirmed:email:${AD_ID}:payment-1`
          )
        );

        expect(
          mockSendAdPaymentConfirmedEmail
        ).toHaveBeenCalledWith(
          "ama@example.com",
          "Ama",
          "Test listing",
          "25.00"
        );
      }
    );

    test(
      "invalid amount fails before delivery",
      async () => {
        const item = event(
          "notification.business_hub.payment_required",
          "business-hub:bad-amount"
        );

        item.payload.amount =
          "not-money";

        await expect(
          dispatchOutboxEvent(item)
        ).rejects.toMatchObject({
          code:
            "OUTBOX_INVALID_EVENT_PAYLOAD",
        });

        expect(
          mockSendAdNotification
        ).not.toHaveBeenCalled();
      }
    );
  }
);
