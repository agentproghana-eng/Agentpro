const fs = require("fs");
const path = require("path");

describe("Telecel Merchant same-network receiver menu correction", () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "../../migrations/156_telecel_merchant_same_network_receiver.sql"
    ),
    "utf8"
  );

  test("targets only the global active Merchant same-network flow", () => {
    expect(migration).toContain("provider = 'telecel'");
    expect(migration).toContain(
      "transaction_type = 'send_money_same_network'"
    );
    expect(migration).toContain(
      "business_sim_role = 'merchant'"
    );
    expect(migration).toContain("company_id IS NULL");
    expect(migration).toContain("owner_user_id IS NULL");
    expect(migration).toContain("is_active = TRUE");
  });

  test("matches the physically observed receiver menu", () => {
    expect(migration).toContain("'choose the receiver'");
    expect(migration).toContain("'enter recipient number'");
    expect(migration).toContain("'my list'");
  });

  test("sends option 1 at exactly step 3", () => {
    expect(migration).toContain("step_order = 3");
    expect(migration).toContain(
      "action = 'send_digit'::ussd_flow_action"
    );
    expect(migration).toContain("action_value = '1'");
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
