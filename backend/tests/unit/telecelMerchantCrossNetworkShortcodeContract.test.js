const fs = require("fs");
const path = require("path");

describe("Telecel Merchant cross-network Organisation Shortcode correction", () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "../../migrations/157_telecel_merchant_cross_network_shortcode.sql"
    ),
    "utf8"
  );

  test("targets only the global active Merchant cross-network flow", () => {
    expect(migration).toContain("provider = 'telecel'");
    expect(migration).toContain(
      "transaction_type = 'send_money_cross_network'"
    );
    expect(migration).toContain(
      "business_sim_role = 'merchant'"
    );
    expect(migration).toContain("company_id IS NULL");
    expect(migration).toContain("owner_user_id IS NULL");
    expect(migration).toContain("is_active = TRUE");
  });

  test("matches the physically observed Org ShortCode prompt", () => {
    expect(migration).toContain(
      "ARRAY['enter your org shortcode']"
    );
  });

  test("retains protected Organisation Shortcode automation", () => {
    expect(migration).toContain(
      "action = 'send_organisation_shortcode'::ussd_flow_action"
    );
  });

  test("does not rewrite the complete flow", () => {
    expect(migration).not.toContain(
      "DELETE FROM ussd_flow_steps"
    );
    expect(migration).not.toContain(
      "INSERT INTO ussd_flow_steps"
    );
  });
});
