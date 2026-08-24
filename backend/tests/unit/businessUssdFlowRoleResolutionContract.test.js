const fs = require("fs");
const path = require("path");

describe("Business USSD role resolution contract", () => {
  const controller = fs.readFileSync(
    path.join(__dirname, "../../src/controllers/ussdFlowController.js"),
    "utf8",
  );

  const migration = fs.readFileSync(
    path.join(__dirname, "../../migrations/091_business_ussd_flow_roles.sql"),
    "utf8",
  );

  test("Business resolver accepts Agent EVD and Merchant only", () => {
    expect(controller).toContain('["agent", "evd", "merchant"]');

    expect(controller).toContain("INVALID_BUSINESS_SIM_ROLE");
  });

  test("missing role falls back to Agent for old app builds", () => {
    expect(controller).toContain('String(sim_role || "agent")');
  });

  test("company and global flow lookup include role", () => {
    const occurrences = (
      controller.match(/COALESCE\(business_sim_role, 'agent'\)/g) || []
    ).length;

    expect(occurrences).toBeGreaterThanOrEqual(2);

    expect(controller).toContain("businessSimRole");
  });

  test("Business unique indexes include the role discriminator", () => {
    expect(migration).toContain("COALESCE(business_sim_role, 'agent')");

    expect(migration).toContain("idx_ussd_flows_global_unique");

    expect(migration).toContain("idx_ussd_flows_company_unique");
  });

  test("migration does not rebuild Personal uniqueness", () => {
    expect(migration).not.toContain(
      "DROP INDEX IF EXISTS idx_ussd_flows_personal_unique",
    );
  });
});
