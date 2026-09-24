const fs = require("fs");
const path = require("path");

describe("Telecel Merchant balance enquiry flow contract", () => {
  const migrationPath = path.join(
    __dirname,
    "../../migrations/152_telecel_merchant_balance_flow.sql",
  );

  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, "utf8");
  });

  test("creates or repairs only the global Merchant balance flow", () => {
    expect(sql).toContain("provider = 'telecel'");
    expect(sql).toContain("transaction_type = 'balance_enquiry'");
    expect(sql).toContain("business_sim_role = 'merchant'");
    expect(sql).toContain("company_id IS NULL");
    expect(sql).toContain("owner_user_id IS NULL");

    expect(sql).toContain("'telecel'");
    expect(sql).toContain("'balance_enquiry'");
    expect(sql).toContain("'merchant'");
    expect(sql).toContain("'*110#'");
  });

  test("assigns the required flow creator from a superuser", () => {
    expect(sql).toContain("superuser_id UUID");
    expect(sql).toContain("WHERE role = 'superuser'");
    expect(sql).toContain("ORDER BY created_at ASC, id ASC");
    expect(sql).toContain("created_by");
    expect(sql).toContain("superuser_id");
    expect(sql).toContain(
      "Cannot seed Telecel Merchant balance flow: no superuser exists",
    );
  });

  test("uses the five verified live Merchant balance steps", () => {
    expect(sql).toContain("ARRAY['my account']");
    expect(sql).toContain("'send_digit'::ussd_flow_action");
    expect(sql).toContain("'8'");

    expect(sql).toContain("ARRAY['show balance']");
    expect(sql).toContain("'1'");

    expect(sql).toContain("ARRAY['enter operator id']");
    expect(sql).toContain("'send_operator_id'::ussd_flow_action");

    expect(sql).toContain("ARRAY['enter pin']");
    expect(sql).toContain("'pin_prompt'::ussd_flow_action");

    expect(sql).toContain(
      "ARRAY['confirm to query', '1 ok', '0 cancel']",
    );
    expect(sql).toContain("'auto_confirm_once'::ussd_flow_action");
  });

  test("has exactly five Merchant balance steps", () => {
    const stepOrders = [
      ...sql.matchAll(
        /merchant_balance_flow_id,\s*(\d+),/g,
      ),
    ].map((match) => Number(match[1]));

    expect(stepOrders).toEqual([1, 2, 3, 4, 5]);
  });

  test("does not automate an Organisation Shortcode", () => {
    expect(sql).not.toContain(
      "'send_organisation_shortcode'::ussd_flow_action",
    );
  });

  test("keeps PIN entry manual", () => {
    expect(sql).toContain("'pin_prompt'::ussd_flow_action");
    expect(sql).not.toMatch(
      /ARRAY\['enter pin'\][\s\S]{0,160}'send_literal'/,
    );
  });

  test("uses only the verified USSD success marker", () => {
    expect(sql).toContain(
      "'request is processed successfully'",
    );
  });
});
