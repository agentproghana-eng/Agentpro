const crypto = require("crypto");

describe("Paystack service", () => {
  let originalFetch;

  beforeEach(() => {
    jest.resetModules();

    originalFetch = global.fetch;

    global.fetch = jest.fn();

    process.env.PAYSTACK_SECRET_KEY = "sk_test_agentpro_unit_test_secret";
  });

  afterEach(() => {
    global.fetch = originalFetch;

    delete process.env.PAYSTACK_SECRET_KEY;
  });

  test("converts GHS amount to pesewas safely", () => {
    const {
      amountToMinorUnits,
    } = require("../../src/services/paystackService");

    expect(amountToMinorUnits(10)).toBe(1000);

    expect(amountToMinorUnits(50.25)).toBe(5025);

    expect(() => amountToMinorUnits(0)).toThrow();
  });

  test("initializes GHS payment only through server secret authentication", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/test",
          access_code: "test-access",
          reference: "APG-BSUB-TEST",
        },
      }),
    });

    const {
      initializeTransaction,
    } = require("../../src/services/paystackService");

    const result = await initializeTransaction({
      email: "owner@example.com",
      amountMinor: 5000,
      reference: "APG-BSUB-TEST",
      metadata: {
        account_mode: "business",
      },
    });

    expect(result.reference).toBe("APG-BSUB-TEST");

    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = global.fetch.mock.calls[0];

    expect(url).toBe("https://api.paystack.co/transaction/initialize");

    expect(options.headers.Authorization).toBe(
      "Bearer sk_test_agentpro_unit_test_secret",
    );

    const body = JSON.parse(options.body);

    expect(body).toEqual(
      expect.objectContaining({
        email: "owner@example.com",
        amount: "5000",
        currency: "GHS",
        reference: "APG-BSUB-TEST",
      }),
    );
  });

  test("verifies provider transaction using its reference", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: true,
        data: {
          status: "success",
          reference: "APG-PSUB-TEST",
          amount: 500,
          currency: "GHS",
        },
      }),
    });

    const { verifyTransaction } = require("../../src/services/paystackService");

    const result = await verifyTransaction("APG-PSUB-TEST");

    expect(result.status).toBe("success");

    expect(global.fetch.mock.calls[0][0]).toContain(
      "/transaction/verify/APG-PSUB-TEST",
    );
  });

  test("accepts only the correct SHA512 webhook signature", () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        event: "charge.success",
        data: {
          reference: "APG-BSUB-TEST",
        },
      }),
    );

    const signature = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

    const {
      verifyWebhookSignature,
    } = require("../../src/services/paystackService");

    expect(verifyWebhookSignature(rawBody, signature)).toBe(true);

    expect(verifyWebhookSignature(rawBody, "0".repeat(128))).toBe(false);
  });

  test("fails closed when the secret key is absent", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;

    const {
      initializeTransaction,
    } = require("../../src/services/paystackService");

    await expect(
      initializeTransaction({
        email: "owner@example.com",
        amountMinor: 1000,
        reference: "APG-BSUB-NO-KEY",
      }),
    ).rejects.toMatchObject({
      code: "PAYSTACK_NOT_CONFIGURED",
    });
  });
});
