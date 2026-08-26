const mockVerifySignature = jest.fn();

const mockFulfill = jest.fn();

const mockLoggerInfo = jest.fn();

const mockLoggerError = jest.fn();

jest.mock("../../src/services/paystackService", () => ({
  verifyWebhookSignature: (...args) => mockVerifySignature(...args),
}));

jest.mock("../../src/services/paystackSubscriptionService", () => ({
  fulfillPaystackTransaction: (...args) => mockFulfill(...args),
}));

jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
  },
}));

const controller = require("../../src/controllers/paystackWebhookController");

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe("Paystack webhook controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("rejects an invalid signature before fulfillment", async () => {
    mockVerifySignature.mockReturnValue(false);

    const req = {
      rawBody: Buffer.from("{}"),
      body: {
        event: "charge.success",
      },
      get: jest.fn().mockReturnValue("invalid"),
    };

    const res = makeRes();

    await controller.handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);

    expect(mockFulfill).not.toHaveBeenCalled();

    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });

  test("ignores signed events other than charge.success", async () => {
    mockVerifySignature.mockReturnValue(true);

    const req = {
      rawBody: Buffer.from("{}"),
      body: {
        event: "customeridentification.success",
      },
      get: jest.fn().mockReturnValue("signature"),
    };

    const res = makeRes();

    await controller.handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(mockFulfill).not.toHaveBeenCalled();
  });

  test("fulfills a signed charge.success event", async () => {
    mockVerifySignature.mockReturnValue(true);

    mockFulfill.mockResolvedValue({
      outcome: "activated",
    });

    const data = {
      reference: "APG-BSUB-123",
      status: "success",
      amount: 5000,
      currency: "GHS",
    };

    const req = {
      rawBody: Buffer.from("{}"),
      body: {
        event: "charge.success",
        data,
      },
      get: jest.fn().mockReturnValue("signature"),
    };

    const res = makeRes();

    await controller.handleWebhook(req, res);

    expect(mockLoggerInfo).toHaveBeenCalledWith("Paystack webhook received", {
      event: "charge.success",
      reference: data.reference,
    });

    expect(mockFulfill).toHaveBeenCalledWith(data, {
      source: "webhook",
      actorUserId: null,
    });

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
