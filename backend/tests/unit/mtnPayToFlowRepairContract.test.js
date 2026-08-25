"use strict";

const fs = require("fs");
const path = require("path");

const migrationPath = path.join(
  __dirname,
  "../../migrations/098_repair_mtn_agent_pay_to_flows.sql",
);

const sql = fs.readFileSync(migrationPath, "utf8");

describe("MTN Agent Pay To flow repair migration", () => {
  test("repairs both missing Agent transaction types", () => {
    expect(sql).toContain("'bill_payment'");
    expect(sql).toContain("'merchant_payment'");
    expect(sql).toContain("business_sim_role = 'agent'");
  });

  test("keeps uncertified candidate flows inactive", () => {
    const inactiveInsertValues = sql.match(/'agent',\s*FALSE,/g) ?? [];

    expect(inactiveInsertValues).toHaveLength(2);

    const inactiveStepTargets = sql.match(/AND f\.is_active = FALSE/g) ?? [];

    expect(inactiveStepTargets).toHaveLength(2);

    expect(sql).not.toContain("AND f.is_active = TRUE");
  });

  test("requires the Pay To main menu before selecting option 1", () => {
    expect(sql).toContain("'mainmenuagent'");
    expect(sql).toContain("'1) pay to'");
  });

  test("keeps Agent and Merchant branches distinct", () => {
    expect(sql).toContain("'1) agent'");
    expect(sql).toContain("'send_customer_phone'");

    expect(sql).toContain("'2) merchant'");
    expect(sql).toContain("'send_merchant_id'");
  });

  test("stops at the PIN prompt", () => {
    expect(sql).toContain("'pin_prompt'");
    expect(sql).not.toContain("'auto_confirm_once'");
  });

  test("uses the agreed failure markers", () => {
    expect(sql).toContain("'failed'");
    expect(sql).toContain("'incomplete'");
    expect(sql).toContain("'insufficient'");
  });
});
