const mockWithTransaction = jest.fn();

const mockAuditLog = jest.fn();

const mockSendToUser = jest.fn();

const mockActivateBusiness = jest.fn();

const mockActivatePersonal = jest.fn();

jest.mock("../../src/config/database", () => ({
  withTransaction: (...args) => mockWithTransaction(...args),
}));

jest.mock("../../src/services/auditService", () => ({
  auditLog: (...args) => mockAuditLog(...args),
}));

jest.mock("../../src/services/notificationService", () => ({
  sendToUser: (...args) => mockSendToUser(...args),
}));

jest.mock("../../src/services/subscriptionActivationService", () => ({
  activateBusinessSubscription: (...args) => mockActivateBusiness(...args),
  activatePersonalSubscription: (...args) => mockActivatePersonal(...args),
}));

jest.mock("../../src/utils/logger", () => ({
  logger: {
    error: jest.fn(),
  },
}));

const {
  fulfillPaystackTransaction,
} = require("../../src/services/paystackSubscriptionService");

describe("Paystack subscription fulfillment", () => {
  let client;

  beforeEach(() => {
    jest.clearAllMocks();

    client = {
      query: jest.fn(),
    };

    mockWithTransaction.mockImplementation(async (callback) =>
      callback(client),
    );

    mockAuditLog.mockResolvedValue(undefined);

    mockSendToUser.mockResolvedValue(undefined);
  });

  test("refuses amount mismatch without activating entitlement", async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "payment-1",
            company_id: "company-1",
            subscription_id: "subscription-1",
            status: "submitted",
            expected_amount_minor: "5000",
          },
        ],
      })
      .mockResolvedValue({
        rows: [],
      });

    const result = await fulfillPaystackTransaction({
      id: 12345,
      reference: "APG-BSUB-TEST",
      status: "success",
      amount: 100,
      currency: "GHS",
      channel: "mobile_money",
    });

    expect(result.outcome).toBe("reconciliation_required");

    expect(mockActivateBusiness).not.toHaveBeenCalled();

    expect(mockActivatePersonal).not.toHaveBeenCalled();
  });

  test("activates Business subscription only after exact provider match", async () => {
    const expiresAt = new Date("2026-09-25T00:00:00.000Z");

    client.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "payment-1",
            company_id: "company-1",
            subscription_id: "subscription-1",
            status: "submitted",
            expected_amount_minor: "5000",
            entitlement_base_captured: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "owner-1",
          },
        ],
      });

    mockActivateBusiness.mockResolvedValue({
      outcome: "activated",
      expiresAt,
    });

    const result = await fulfillPaystackTransaction({
      id: 12345,
      reference: "APG-BSUB-TEST",
      status: "success",
      amount: 5000,
      currency: "GHS",
      channel: "mobile_money",
    });

    expect(result.outcome).toBe("activated");

    expect(mockActivateBusiness).toHaveBeenCalledTimes(1);

    expect(mockActivatePersonal).not.toHaveBeenCalled();

    expect(mockSendToUser).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({
        type: "renewal_approved",
      }),
    );
  });

  test("same verified payment is idempotent", async () => {
    client.query.mockResolvedValueOnce({
      rows: [
        {
          id: "payment-verified",
          company_id: "company-1",
          subscription_id: "subscription-1",
          status: "verified",
          fulfilled_at: new Date(),
          expected_amount_minor: "5000",
        },
      ],
    });

    const result = await fulfillPaystackTransaction({
      id: 12345,
      reference: "APG-BSUB-TEST",
      status: "success",
      amount: 5000,
      currency: "GHS",
    });

    expect(result.outcome).toBe("already_fulfilled");

    expect(mockActivateBusiness).not.toHaveBeenCalled();

    expect(mockSendToUser).not.toHaveBeenCalled();
  });
});
