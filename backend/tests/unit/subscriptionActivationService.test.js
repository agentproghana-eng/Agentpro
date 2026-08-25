const {
  activateBusinessSubscription,
  activatePersonalSubscription,
} = require("../../src/services/subscriptionActivationService");

describe("shared subscription activation service", () => {
  test("Business activation extends from the captured current expiry", async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "subscription-1",
              status: "active",
              expires_at: new Date("2026-09-01T00:00:00.000Z"),
            },
          ],
        })
        .mockResolvedValue({
          rows: [],
        }),
    };

    const result = await activateBusinessSubscription({
      client,
      payment: {
        id: "payment-1",
        subscription_id: "subscription-1",
        company_id: "company-1",
        status: "pending",
        payment_provider: "paystack",
        entitlement_base_captured: true,
        period_months: 1,
        entitlement_base_expires_at: new Date("2026-09-01T00:00:00.000Z"),
      },
      providerStatus: "success",
      now: new Date("2026-08-25T12:00:00.000Z"),
    });

    expect(result.outcome).toBe("activated");

    expect(
      client.query.mock.calls.map(([sql]) => String(sql)).join("\n"),
    ).toContain("SET plan = 'business'");

    expect(
      client.query.mock.calls.map(([sql]) => String(sql)).join("\n"),
    ).toContain("status = 'verified'");
  });

  test("same-cycle stale payment cannot extend Business access twice", async () => {
    const client = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            id: "subscription-1",
            status: "active",
            expires_at: new Date("2026-10-01T00:00:00.000Z"),
          },
        ],
      }),
    };

    const result = await activateBusinessSubscription({
      client,
      payment: {
        id: "stale-payment",
        subscription_id: "subscription-1",
        company_id: "company-1",
        status: "pending",
        payment_provider: "paystack",
        entitlement_base_captured: true,
        entitlement_base_expires_at: new Date("2026-09-01T00:00:00.000Z"),
      },
      now: new Date("2026-08-25T12:00:00.000Z"),
    });

    expect(result.outcome).toBe("superseded");

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test("Personal activation uses the same fulfillment guard", async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: "user-1",
              plan: "free",
              expires_at: null,
            },
          ],
        })
        .mockResolvedValue({
          rows: [],
        }),
    };

    const result = await activatePersonalSubscription({
      client,
      payment: {
        id: "personal-payment-1",
        user_id: "user-1",
        status: "pending",
        payment_provider: "paystack",
        entitlement_base_captured: true,
        entitlement_base_expires_at: null,
      },
      providerStatus: "success",
      now: new Date("2026-08-25T12:00:00.000Z"),
    });

    expect(result.outcome).toBe("activated");
  });

  test("legacy manual payment remains approvable without a captured base", async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: "user-1",
              plan: "free",
              expires_at: null,
            },
          ],
        })
        .mockResolvedValue({
          rows: [],
        }),
    };

    const result = await activatePersonalSubscription({
      client,
      payment: {
        id: "legacy-manual",
        user_id: "user-1",
        status: "pending",
        payment_provider: "manual_momo",
        entitlement_base_expires_at: null,
      },
      verifiedBy: "superuser-1",
      providerStatus: "manual_verified",
    });

    expect(result.outcome).toBe("activated");
  });
  test("Paystack attempt without an explicit snapshot marker fails closed", async () => {
    const client = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            user_id: "user-1",
            plan: "free",
            expires_at: null,
          },
        ],
      }),
    };

    const result = await activatePersonalSubscription({
      client,
      payment: {
        id: "uncaptured-paystack-payment",
        user_id: "user-1",
        status: "pending",
        payment_provider: "paystack",
        entitlement_base_captured: false,
        entitlement_base_expires_at: null,
      },
      providerStatus: "success",
      now: new Date("2026-08-25T12:00:00.000Z"),
    });

    expect(result.outcome).toBe("superseded");

    expect(client.query).toHaveBeenCalledTimes(1);
  });
  test("payment started before expiry can complete just after natural expiry", async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "subscription-1",
              status: "active",
              expires_at: new Date("2026-08-25T12:00:00.000Z"),
            },
          ],
        })
        .mockResolvedValue({
          rows: [],
        }),
    };

    const result = await activateBusinessSubscription({
      client,
      payment: {
        id: "cross-expiry-payment",
        subscription_id: "subscription-1",
        company_id: "company-1",
        status: "submitted",
        payment_provider: "paystack",
        entitlement_base_captured: true,
        entitlement_base_expires_at: new Date("2026-08-25T12:00:00.000Z"),
      },
      providerStatus: "success",
      now: new Date("2026-08-25T12:00:01.000Z"),
    });

    expect(result.outcome).toBe("activated");
  });
});
