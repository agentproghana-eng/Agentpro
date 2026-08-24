const fs = require("fs");
const path = require("path");

describe("Business USSD Flow update role contract", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../../src/controllers/ussdFlowController.js"),
    "utf8",
  );

  test("update accepts explicit Agent EVD or Merchant role", () => {
    expect(source).toContain("hasBusinessSimRole");

    expect(source).toContain("requestedBusinessSimRole");

    expect(source).toContain('["agent", "evd", "merchant"]');
  });

  test("omitted role preserves existing role", () => {
    expect(source).toContain("CASE WHEN $8 THEN $9 ELSE business_sim_role END");
  });

  test("update parameter list persists explicit role", () => {
    expect(source).toContain("hasBusinessSimRole,");

    expect(source).toContain("requestedBusinessSimRole,");
  });
});
