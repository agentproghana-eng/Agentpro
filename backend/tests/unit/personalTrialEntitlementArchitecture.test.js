const fs = require("fs");
const path = require("path");

const {
  TRIAL_IDENTITY_VERSION,
  normalizeGhanaPhone,
  normalizeInstallationId,
  normalizeSimIccid,
  hashPersonalTrialIdentity,
} = require("../../src/services/personalTrialEntitlementService");

const migrationPath = path.join(
  __dirname,
  "../../migrations/097_personal_trial_entitlement_foundation.sql",
);

const testPepper = "gate3-test-pepper-0123456789-abcdefghijklmnopqrstuvwxyz";

describe("Personal trial entitlement architecture", () => {
  test("migration creates durable entitlement history", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS personal_trial_entitlements",
    );
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS personal_trial_identity_claims",
    );
    expect(sql).toContain("uq_personal_trial_entitlement_user");
    expect(sql).toContain("uq_personal_trial_identity_claim");
    expect(sql).toContain("phone_verified_at");
    expect(sql).toContain("ON DELETE SET NULL");
    expect(sql).toContain("ON DELETE RESTRICT");
  });

  test("trial claims store digests rather than raw values", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("claim_hash");
    expect(sql).toContain("CHAR(64)");
    expect(sql).not.toContain("raw_phone");
    expect(sql).not.toContain("raw_installation");
    expect(sql).not.toContain("raw_iccid");
  });

  test("normalizes equivalent Ghana phone formats identically", () => {
    expect(normalizeGhanaPhone("0241234567")).toBe("+233241234567");

    expect(normalizeGhanaPhone("233241234567")).toBe("+233241234567");

    expect(normalizeGhanaPhone("+233 24 123 4567")).toBe("+233241234567");

    expect(normalizeGhanaPhone("241234567")).toBe("+233241234567");
  });

  test("rejects malformed phone identities", () => {
    expect(() => normalizeGhanaPhone("12345")).toThrow("valid Ghana number");
  });

  test("normalizes installation identity conservatively", () => {
    expect(
      normalizeInstallationId("11111111-1111-4111-8111-111111111111"),
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("rejects malformed installation identity", () => {
    expect(() => normalizeInstallationId("device-one")).toThrow("valid UUID");
  });

  test("normalizes ICCID without exposing it in hash result", () => {
    const iccid = normalizeSimIccid("892330 1234567890123");

    expect(iccid).toBe("8923301234567890123");

    const claim = hashPersonalTrialIdentity({
      claimType: "sim_iccid",
      value: iccid,
      pepper: testPepper,
    });

    expect(claim.claimType).toBe("sim_iccid");
    expect(claim.claimVersion).toBe(TRIAL_IDENTITY_VERSION);
    expect(claim.claimHash).toMatch(/^[0-9a-f]{64}$/);

    expect(JSON.stringify(claim).includes(iccid)).toBe(false);
  });

  test("same phone produces same digest", () => {
    const first = hashPersonalTrialIdentity({
      claimType: "phone",
      value: "0241234567",
      pepper: testPepper,
    });

    const second = hashPersonalTrialIdentity({
      claimType: "phone",
      value: "+233241234567",
      pepper: testPepper,
    });

    expect(first).toEqual(second);
  });

  test("different phones produce different digests", () => {
    const first = hashPersonalTrialIdentity({
      claimType: "phone",
      value: "0241234567",
      pepper: testPepper,
    });

    const second = hashPersonalTrialIdentity({
      claimType: "phone",
      value: "0551234567",
      pepper: testPepper,
    });

    expect(first.claimHash).not.toBe(second.claimHash);
  });

  test("identity hashing fails closed without strong pepper", () => {
    expect(() =>
      hashPersonalTrialIdentity({
        claimType: "phone",
        value: "0241234567",
        pepper: "short",
      }),
    ).toThrow("Trial identity protection is not configured");
  });
});
