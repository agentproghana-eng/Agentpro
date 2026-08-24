const { _test } = require("../../src/controllers/userSimPurposeController");

describe("SIM purpose roles", () => {
  test("normalizes historical personal to subscriber", () => {
    expect(_test.normalizePurpose("personal")).toBe("subscriber");

    expect(_test.normalizePurpose("agent")).toBe("agent");
  });

  test("accepts all supported MTN roles", () => {
    for (const purpose of ["agent", "subscriber", "evd", "merchant"]) {
      expect(
        _test.validateAssignment({
          sim_slot: 0,
          sim_iccid: "SIM-MTN-0",
          provider: "mtn",
          purpose,
        }),
      ).toBeNull();
    }
  });

  test("rejects EVD for Telecel", () => {
    expect(
      _test.validateAssignment({
        sim_slot: 0,
        provider: "telecel",
        purpose: "evd",
      }),
    ).toMatch(/not supported/);
  });

  test("rejects EVD for AT Money", () => {
    expect(
      _test.validateAssignment({
        sim_slot: 1,
        provider: "at_money",
        purpose: "evd",
      }),
    ).toMatch(/not supported/);
  });

  test("accepts legacy personal during rollout", () => {
    expect(
      _test.validateAssignment({
        sim_slot: 0,
        sim_iccid: "SIM-MTN-LEGACY",
        provider: "mtn",
        purpose: "personal",
      }),
    ).toBeNull();
  });

  test("rejects invalid SIM slots", () => {
    expect(
      _test.validateAssignment({
        sim_slot: -1,
        provider: "mtn",
        purpose: "agent",
      }),
    ).toMatch(/sim_slot/);
  });

  test("accepts strong unresolved SIM identity", () => {
    expect(
      _test.validateAssignment({
        sim_slot: 0,
        provider: "mtn",
        purpose: "merchant",
        installation_id: "11111111-1111-4111-8111-111111111111",
        sim_subscription_id: 7,
      }),
    ).toBeNull();
  });

  test("rejects incomplete unresolved SIM identity", () => {
    expect(
      _test.validateAssignment({
        sim_slot: 0,
        provider: "mtn",
        purpose: "agent",
        installation_id: "11111111-1111-4111-8111-111111111111",
      }),
    ).toMatch(/sim_subscription_id/);
  });

  test("rejects malformed installation identity", () => {
    expect(
      _test.validateAssignment({
        sim_slot: 0,
        provider: "mtn",
        purpose: "agent",
        installation_id: "not-a-uuid",
        sim_subscription_id: 7,
      }),
    ).toMatch(/installation_id/);
  });
});
