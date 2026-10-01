const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");

const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Telecel Merchant withdrawal identifier contract", () => {
  const route = read("src/routes/transaction.routes.js");
  const migration = read(
    "migrations/162_telecel_merchant_agent_till_withdrawal.sql",
  );

  test("Till Number remains an opaque external identifier", () => {
    expect(route).toContain(
      "Telecel Merchant cash_out uses customer_phone as an opaque external",
    );
    expect(route).toContain(
      "Customer phone or till number is required for this transaction type",
    );
  });

  test("existing production flow remains compatible", () => {
    expect(migration).toContain("ARRAY['enter till number']");
    expect(migration).toContain(
      "'send_customer_phone'::ussd_flow_action",
    );
    expect(migration).toContain("ARRAY['enter amount']");
    expect(migration).toContain(
      "'send_amount'::ussd_flow_action",
    );
  });

  test("withdrawal keeps manual PIN boundary", () => {
    expect(migration).toContain(
      "'pin_prompt'::ussd_flow_action",
    );
    expect(migration).not.toContain("'send_pin'");
  });
});
