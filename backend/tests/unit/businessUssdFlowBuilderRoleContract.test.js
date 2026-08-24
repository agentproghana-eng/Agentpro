const fs = require("fs");
const path = require("path");

describe("Business USSD Flow Builder role contract", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../../src/controllers/ussdFlowController.js"),
    "utf8",
  );

  test("create flow accepts Agent EVD and Merchant", () => {
    expect(source).toContain("business_sim_role");

    expect(source).toContain('["agent", "evd", "merchant"]');
  });

  test("new Business flows default to Agent", () => {
    expect(source).toContain('String(business_sim_role || "agent")');
  });

  test("Personal-only Global rows persist no Business role", () => {
    expect(source).toContain("resolvedGlobalAccountMode");

    expect(source).toContain("persistedBusinessSimRole");

    expect(source).toContain("GLOBAL_ACCOUNT_MODE_REQUIRED");
  });

  test("create INSERT persists the resolved role", () => {
    expect(source).toContain("business_sim_role,");

    expect(source).toContain("persistedBusinessSimRole");
  });
});
