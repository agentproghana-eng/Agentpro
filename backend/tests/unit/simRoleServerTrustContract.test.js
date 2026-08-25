const fs = require("fs");
const path = require("path");

const {
  resolveSimRoleAssignment,
  verifyBusinessSimRoleAssignment,
} = require("../../src/services/simRoleTrustService");

const fallbackInstallation = "11111111-1111-4111-8111-111111111111";

const assignment = (overrides = {}) => ({
  sim_slot: 0,
  sim_iccid: "SIM-A",
  provider: "mtn",
  purpose: "merchant",
  installation_id: fallbackInstallation,
  sim_subscription_id: 9,
  ...overrides,
});

describe("Business SIM role server trust", () => {
  test("accepts matching ICCID and persisted role", async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [assignment()],
    });

    const result = await verifyBusinessSimRoleAssignment({
      queryFn,
      userId: "user-1",
      provider: "mtn",
      claimedRole: "merchant",
      simSlot: 0,
      simIccid: "SIM-A",
      installationId: fallbackInstallation,
      simSubscriptionId: 9,
    });

    expect(result.ok).toBe(true);
    expect(result.role).toBe("merchant");

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining("FROM user_sim_purposes"),
      ["user-1", 0],
    );
  });

  test("rejects a malicious claimed role change", async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [
        assignment({
          purpose: "agent",
        }),
      ],
    });

    const result = await verifyBusinessSimRoleAssignment({
      queryFn,
      userId: "user-1",
      provider: "mtn",
      claimedRole: "merchant",
      simSlot: 0,
      simIccid: "SIM-A",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("SIM_ROLE_MISMATCH");
  });

  test("rejects a different ICCID in the same slot", async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [assignment()],
    });

    const result = await verifyBusinessSimRoleAssignment({
      queryFn,
      userId: "user-1",
      provider: "mtn",
      claimedRole: "merchant",
      simSlot: 0,
      simIccid: "SIM-B",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("SIM_ROLE_IDENTITY_MISMATCH");
  });

  test("accepts exact unresolved fallback identity", async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [
        assignment({
          sim_iccid: null,
        }),
      ],
    });

    const result = await verifyBusinessSimRoleAssignment({
      queryFn,
      userId: "user-1",
      provider: "mtn",
      claimedRole: "merchant",
      simSlot: 0,
      installationId: fallbackInstallation,
      simSubscriptionId: 9,
    });

    expect(result.ok).toBe(true);
  });

  test("rejects different unresolved subscription identity", async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [
        assignment({
          sim_iccid: null,
        }),
      ],
    });

    const result = await verifyBusinessSimRoleAssignment({
      queryFn,
      userId: "user-1",
      provider: "mtn",
      claimedRole: "merchant",
      simSlot: 0,
      installationId: fallbackInstallation,
      simSubscriptionId: 10,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("SIM_ROLE_IDENTITY_UNVERIFIED");
  });

  test("rejects missing persisted assignment", async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [],
    });

    const result = await verifyBusinessSimRoleAssignment({
      queryFn,
      userId: "user-1",
      provider: "mtn",
      claimedRole: "agent",
      simSlot: 0,
      simIccid: "SIM-A",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("SIM_ROLE_ASSIGNMENT_REQUIRED");
  });

  test("new transaction verifies role after replay and before automation preflight", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../src/controllers/transactionController.js"),
      "utf8",
    );

    const replay = source.indexOf("if (client_operation_id)");

    const verification = source.indexOf("const roleVerification =");

    const preflight = source.indexOf("const [flagResult, branchResolution");

    expect(replay).toBeGreaterThanOrEqual(0);

    expect(verification).toBeGreaterThan(replay);

    expect(preflight).toBeGreaterThan(verification);
  });

  test("migration stores fallback identity and separates Global modes", () => {
    const migration = fs.readFileSync(
      path.join(
        __dirname,
        "../../migrations/095_sim_role_server_trust_and_flow_isolation.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("installation_id UUID");

    expect(migration).toContain("sim_subscription_id INTEGER");

    expect(migration).toContain("COALESCE(business_sim_role, 'personal')");
  });

  test("rejects a missing claimed Business role", async () => {
    const queryFn = jest.fn();

    const result = await verifyBusinessSimRoleAssignment({
      queryFn,
      userId: "user-1",
      provider: "mtn",
      claimedRole: null,
      simSlot: 0,
      simIccid: "SIM-A",
    });

    expect(result.ok).toBe(false);

    expect(result.code).toBe("INVALID_BUSINESS_SIM_ROLE");

    expect(queryFn).not.toHaveBeenCalled();
  });
  test("resolves a trusted Subscriber role for balance reads", async () => {
    const queryFn =
      jest.fn().mockResolvedValue({
        rows: [
          assignment({
            purpose: "subscriber",
          }),
        ],
      });

    const result =
      await resolveSimRoleAssignment({
        queryFn,
        userId: "user-1",
        provider: "mtn",
        simSlot: 0,
        simIccid: "SIM-A",
        installationId:
          fallbackInstallation,
        simSubscriptionId: 9,
      });

    expect(result.ok).toBe(true);
    expect(result.role).toBe(
      "subscriber"
    );
  });

  test("rejects EVD assignment outside MTN", async () => {
    const queryFn =
      jest.fn().mockResolvedValue({
        rows: [
          assignment({
            provider: "telecel",
            purpose: "evd",
          }),
        ],
      });

    const result =
      await resolveSimRoleAssignment({
        queryFn,
        userId: "user-1",
        provider: "telecel",
        simSlot: 0,
        simIccid: "SIM-A",
        installationId:
          fallbackInstallation,
        simSubscriptionId: 9,
      });

    expect(result.ok).toBe(false);

    expect(result.code).toBe(
      "SIM_ROLE_ASSIGNMENT_INVALID"
    );
  });

  test("role resolver rejects a different physical ICCID", async () => {
    const queryFn =
      jest.fn().mockResolvedValue({
        rows: [assignment()],
      });

    const result =
      await resolveSimRoleAssignment({
        queryFn,
        userId: "user-1",
        provider: "mtn",
        simSlot: 0,
        simIccid: "SIM-B",
      });

    expect(result.ok).toBe(false);

    expect(result.code).toBe(
      "SIM_ROLE_IDENTITY_MISMATCH"
    );
  });

});
