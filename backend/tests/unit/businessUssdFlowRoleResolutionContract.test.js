const fs = require("fs");
const path = require("path");

describe("Business USSD role resolution contract", () => {
  const controller = fs.readFileSync(
    path.join(__dirname, "../../src/controllers/ussdFlowController.js"),
    "utf8",
  );

  const rolloutMigration = fs.readFileSync(
    path.join(__dirname, "../../migrations/091_business_ussd_flow_roles.sql"),
    "utf8",
  );

  const hardeningMigration = fs.readFileSync(
    path.join(
      __dirname,
      "../../migrations/095_sim_role_server_trust_and_flow_isolation.sql",
    ),
    "utf8",
  );

  test("Business resolver accepts Agent EVD and Merchant only", () => {
    expect(controller).toContain('["agent", "evd", "merchant"]');

    expect(controller).toContain("INVALID_BUSINESS_SIM_ROLE");
  });

  test("missing client role still maps to Agent for old app builds", () => {
    expect(controller).toContain('String(sim_role || "agent")');
  });

  test("Business database lookup requires explicit role", () => {
    const occurrences = (controller.match(/business_sim_role = \$/g) || [])
      .length;

    expect(occurrences).toBeGreaterThanOrEqual(2);

    expect(controller).not.toContain("COALESCE(business_sim_role, 'agent') =");
  });

  test("historical migration backfilled legacy Business rows", () => {
    expect(rolloutMigration).toContain("SET business_sim_role = 'agent'");
  });

  test("Global uniqueness distinguishes Personal from Agent", () => {
    expect(hardeningMigration).toContain(
      "COALESCE(business_sim_role, 'personal')",
    );

    expect(hardeningMigration).toContain("idx_ussd_flows_global_unique");
  });

  test("Personal uniqueness remains untouched", () => {
    expect(hardeningMigration).not.toContain("idx_ussd_flows_personal_unique");
  });
});
