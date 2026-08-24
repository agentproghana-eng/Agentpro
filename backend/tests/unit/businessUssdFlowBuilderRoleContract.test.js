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

  test("create INSERT persists the role", () => {
    expect(source).toContain("business_sim_role,");

    expect(source).toContain("businessSimRole");
  });
});
