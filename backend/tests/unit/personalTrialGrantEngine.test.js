const {
  TrialDecisionReason,
  assessPersonalTrialEligibility,
  grantPersonalTrial,
} = require("../../src/services/personalTrialEntitlementService");

const pepper = "gate3-test-pepper-0123456789-abcdefghijklmnopqrstuvwxyz";

const verifiedAt = new Date("2026-08-25T06:00:00.000Z");

function clientFromHandlers(handlers) {
  let index = 0;

  return {
    query: jest.fn(async (sql, params) => {
      const handler = handlers[index];

      if (handler == null) {
        throw new Error(`Unexpected query at index ${index}`);
      }

      index += 1;

      return handler(String(sql), params);
    }),
  };
}

describe("Personal trial grant engine", () => {
  test("requires verified phone before eligibility", async () => {
    const client = {
      query: jest.fn(),
    };

    const result = await assessPersonalTrialEligibility({
      dbClient: client,
      userId: "11111111-1111-4111-8111-111111111111",
      phone: "0241234567",
      phoneVerifiedAt: null,
      pepper,
    });

    expect(result).toEqual({
      eligible: false,
      reason: TrialDecisionReason.PHONE_VERIFICATION_REQUIRED,
      phoneClaim: null,
    });

    expect(client.query).not.toHaveBeenCalled();
  });

  test("rejects durable same-phone trial history", async () => {
    const client = clientFromHandlers([
      (sql) => {
        expect(sql).toContain("personal_trial_identity_claims");

        return {
          rows: [{ id: "existing-entitlement" }],
        };
      },
    ]);

    const result = await assessPersonalTrialEligibility({
      dbClient: client,
      userId: "11111111-1111-4111-8111-111111111111",
      phone: "0241234567",
      phoneVerifiedAt: verifiedAt,
      pepper,
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe(TrialDecisionReason.TRIAL_ALREADY_USED);
  });

  test("rejects legacy same-phone Personal history", async () => {
    const client = clientFromHandlers([
      (sql) => {
        expect(sql).toContain("personal_trial_entitlements");

        return { rows: [] };
      },
      (sql, params) => {
        expect(sql).toContain("INNER JOIN personal_subscriptions");

        expect(params).toEqual(["241234567"]);

        return {
          rows: [
            {
              id: "legacy-user",
              phone: "+233 24 123 4567",
            },
          ],
        };
      },
    ]);

    const result = await assessPersonalTrialEligibility({
      dbClient: client,
      userId: "22222222-2222-4222-8222-222222222222",
      phone: "0241234567",
      phoneVerifiedAt: verifiedAt,
      pepper,
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe(TrialDecisionReason.TRIAL_ALREADY_USED);
  });

  test("allows a verified phone with no prior history", async () => {
    const client = clientFromHandlers([
      () => ({ rows: [] }),
      () => ({ rows: [] }),
    ]);

    const result = await assessPersonalTrialEligibility({
      dbClient: client,
      userId: "33333333-3333-4333-8333-333333333333",
      phone: "0551234567",
      phoneVerifiedAt: verifiedAt,
      pepper,
    });

    expect(result.eligible).toBe(true);
    expect(result.reason).toBe(TrialDecisionReason.ELIGIBLE);

    expect(result.phoneClaim.claimHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("grants one seven-day entitlement", async () => {
    const userId = "44444444-4444-4444-8444-444444444444";

    const entitlementId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    const client = clientFromHandlers([
      () => ({ rows: [] }),
      () => ({ rows: [] }),
      (sql, params) => {
        expect(sql).toContain("INSERT INTO personal_trial_entitlements");

        expect(params[0]).toBe(userId);
        expect(params[1]).toBe("registration");

        return {
          rows: [{ id: entitlementId }],
        };
      },
      (sql, params) => {
        expect(sql).toContain("INSERT INTO personal_trial_identity_claims");

        expect(params[0]).toBe(entitlementId);

        expect(params[1]).toBe("phone");
        expect(params[2]).toMatch(/^[0-9a-f]{64}$/);

        return {
          rows: [{ id: "phone-claim" }],
        };
      },
    ]);

    const now = new Date("2026-08-25T07:00:00.000Z");

    const result = await grantPersonalTrial({
      dbClient: client,
      userId,
      source: "registration",
      phone: "0551234567",
      phoneVerifiedAt: verifiedAt,
      pepper,
      now,
    });

    expect(result.granted).toBe(true);

    expect(result.expiresAt.toISOString()).toBe("2026-09-01T07:00:00.000Z");

    expect(result.entitlementId).toBe(entitlementId);
  });

  test("concurrent same-phone claim loses safely", async () => {
    const entitlementId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    const client = clientFromHandlers([
      () => ({ rows: [] }),
      () => ({ rows: [] }),
      () => ({
        rows: [{ id: entitlementId }],
      }),
      (sql) => {
        expect(sql).toContain("ON CONFLICT");

        return { rows: [] };
      },
      (sql, params) => {
        expect(sql).toContain("DELETE FROM personal_trial_entitlements");

        expect(params).toEqual([entitlementId]);

        return { rows: [] };
      },
    ]);

    const result = await grantPersonalTrial({
      dbClient: client,
      userId: "55555555-5555-4555-8555-555555555555",
      source: "registration",
      phone: "0241234567",
      phoneVerifiedAt: verifiedAt,
      pepper,
    });

    expect(result).toEqual({
      granted: false,
      reason: TrialDecisionReason.TRIAL_ALREADY_USED,
      expiresAt: null,
    });
  });

  test("same account entitlement conflict denies another grant", async () => {
    const client = clientFromHandlers([
      () => ({ rows: [] }),
      () => ({ rows: [] }),
      (sql) => {
        expect(sql).toContain("ON CONFLICT (user_id)");

        return { rows: [] };
      },
    ]);

    const result = await grantPersonalTrial({
      dbClient: client,
      userId: "66666666-6666-4666-8666-666666666666",
      source: "personal_capability",
      phone: "0201234567",
      phoneVerifiedAt: verifiedAt,
      pepper,
    });

    expect(result.granted).toBe(false);
    expect(result.reason).toBe(TrialDecisionReason.TRIAL_ALREADY_USED);
  });

  test("concurrent same-installation claim loses safely", async () => {
    const entitlementId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    const client = clientFromHandlers([
      () => ({ rows: [] }),
      (sql, params) => {
        expect(sql).toContain(
          "claim_type = 'installation'",
        );

        expect(params[0]).toMatch(
          /^[0-9a-f]{64}$/,
        );

        return { rows: [] };
      },
      () => ({ rows: [] }),
      () => ({
        rows: [{ id: entitlementId }],
      }),
      (sql, params) => {
        expect(params[1]).toBe("phone");

        return {
          rows: [{ id: "phone-claim" }],
        };
      },
      (sql, params) => {
        expect(sql).toContain("ON CONFLICT");
        expect(sql).toContain("RETURNING id");
        expect(params[1]).toBe("installation");

        return { rows: [] };
      },
      (sql, params) => {
        expect(sql).toContain(
          "DELETE FROM personal_trial_identity_claims",
        );

        expect(params).toEqual([entitlementId]);

        return { rows: [] };
      },
      (sql, params) => {
        expect(sql).toContain(
          "DELETE FROM personal_trial_entitlements",
        );

        expect(params).toEqual([entitlementId]);

        return { rows: [] };
      },
    ]);

    const result = await grantPersonalTrial({
      dbClient: client,
      userId: "77777777-7777-4777-8777-777777777777",
      source: "registration",
      phone: "0271234567",
      phoneVerifiedAt: verifiedAt,
      installationId: "11111111-1111-4111-8111-111111111111",
      pepper,
    });

    expect(result).toEqual({
      granted: false,
      reason: TrialDecisionReason.TRIAL_ALREADY_USED,
      expiresAt: null,
    });
  });
});

describe("SIM ICCID trial-abuse defense", () => {
  test("same ICCID blocks a different account and phone", async () => {
    const client = clientFromHandlers([
      () => ({ rows: [] }),
      (sql, params) => {
        expect(sql).toContain("claim_type = 'sim_iccid'");

        expect(params[0]).toMatch(/^[0-9a-f]{64}$/);

        return {
          rows: [
            {
              id: "existing-sim-entitlement",
            },
          ],
        };
      },
    ]);

    const result = await assessPersonalTrialEligibility({
      dbClient: client,
      userId: "88888888-8888-4888-8888-888888888888",
      phone: "0591234567",
      phoneVerifiedAt: verifiedAt,
      simIccid: "8923301234567890123",
      pepper,
    });

    expect(result.eligible).toBe(false);

    expect(result.reason).toBe(TrialDecisionReason.TRIAL_ALREADY_USED);

    expect(result.simClaim.claimHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("unused ICCID permits verified phone eligibility", async () => {
    const client = clientFromHandlers([
      () => ({ rows: [] }),
      () => ({ rows: [] }),
      () => ({ rows: [] }),
    ]);

    const result = await assessPersonalTrialEligibility({
      dbClient: client,
      userId: "99999999-9999-4999-8999-999999999999",
      phone: "0501234567",
      phoneVerifiedAt: verifiedAt,
      simIccid: "8923309876543210123",
      pepper,
    });

    expect(result.eligible).toBe(true);

    expect(result.simClaim.claimHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("ICCID race removes provisional entitlement safely", async () => {
    const entitlementId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

    const client = clientFromHandlers([
      () => ({ rows: [] }),
      () => ({ rows: [] }),
      () => ({ rows: [] }),
      () => ({
        rows: [{ id: entitlementId }],
      }),
      () => ({
        rows: [{ id: "phone-claim" }],
      }),
      (sql) => {
        expect(sql).toContain("ON CONFLICT");

        return { rows: [] };
      },
      (sql, params) => {
        expect(sql).toContain("DELETE FROM personal_trial_identity_claims");

        expect(params).toEqual([entitlementId]);

        return { rows: [] };
      },
      (sql, params) => {
        expect(sql).toContain("DELETE FROM personal_trial_entitlements");

        expect(params).toEqual([entitlementId]);

        return { rows: [] };
      },
    ]);

    const result = await grantPersonalTrial({
      dbClient: client,
      userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      source: "registration",
      phone: "0541234567",
      phoneVerifiedAt: verifiedAt,
      simIccid: "8923301234567890123",
      pepper,
    });

    expect(result.granted).toBe(false);

    expect(result.reason).toBe(TrialDecisionReason.TRIAL_ALREADY_USED);
  });
});

describe("Personal trial expiry invariants", () => {
  test("subscription expiry never restores trial eligibility", async () => {
    const client = clientFromHandlers([
      (sql) => {
        expect(sql).toContain("personal_trial_entitlements");

        return {
          rows: [
            {
              id: "historic-entitlement",
            },
          ],
        };
      },
    ]);

    const result = await assessPersonalTrialEligibility({
      dbClient: client,
      userId: "12121212-1212-4121-8121-121212121212",
      phone: "0241234567",
      phoneVerifiedAt: verifiedAt,
      simIccid: "8923301234567890123",
      pepper,
    });

    expect(result.eligible).toBe(false);

    expect(result.reason).toBe(TrialDecisionReason.TRIAL_ALREADY_USED);
  });

  test("expired legacy Personal subscription still blocks another trial", async () => {
    const client = clientFromHandlers([
      () => ({ rows: [] }),
      () => ({ rows: [] }),
      (sql) => {
        expect(sql).toContain("INNER JOIN personal_subscriptions");

        return {
          rows: [
            {
              id: "historic-personal-user",
              phone: "0241234567",
            },
          ],
        };
      },
    ]);

    const result = await assessPersonalTrialEligibility({
      dbClient: client,
      userId: "13131313-1313-4131-8131-131313131313",
      phone: "0241234567",
      phoneVerifiedAt: verifiedAt,
      simIccid: "8923309876543210123",
      pepper,
    });

    expect(result.eligible).toBe(false);

    expect(result.reason).toBe(TrialDecisionReason.TRIAL_ALREADY_USED);
  });

  test("expired subscription does not prevent purchasing again", () => {
    const policy = {
      blocksRegistration: false,
      blocksLogin: false,
      blocksPaidRenewal: false,
      blocksFreshTrial: true,
    };

    expect(policy).toEqual({
      blocksRegistration: false,
      blocksLogin: false,
      blocksPaidRenewal: false,
      blocksFreshTrial: true,
    });
  });
});
