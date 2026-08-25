"use strict";

const fs = require("fs");
const path = require("path");

const migration99 = fs.readFileSync(
  path.join(
    __dirname,
    "../../migrations/099_rename_pay_to_agent_transaction_type.sql",
  ),
  "utf8",
);

const migration100 = fs.readFileSync(
  path.join(
    __dirname,
    "../../migrations/100_activate_certified_mtn_pay_to_flows.sql",
  ),
  "utf8",
);

const constantsSource = fs.readFileSync(
  path.join(__dirname, "../../src/config/constants.js"),
  "utf8",
);

const transactionRouteSource = fs.readFileSync(
  path.join(__dirname, "../../src/routes/transaction.routes.js"),
  "utf8",
);

const transactionControllerSource = fs.readFileSync(
  path.join(__dirname, "../../src/controllers/transactionController.js"),
  "utf8",
);

const postingSource = fs.readFileSync(
  path.join(__dirname, "../../src/services/payToAgentPostingService.js"),
  "utf8",
);

const adminPagesSource = fs.readFileSync(
  path.join(__dirname, "../../../admin_portal/src/pages.jsx"),
  "utf8",
);

describe("Pay to Agent canonical transaction type", () => {
  test("renames the historical bill_payment enum value", () => {
    expect(migration99).toContain("RENAME VALUE 'bill_payment'");
    expect(migration99).toContain("TO 'pay_to_agent'");
  });

  test("reserves bill_payment for the future feature", () => {
    expect(migration99).toContain("ADD VALUE 'bill_payment'");

    expect(constantsSource).toContain("PAY_TO_AGENT: 'pay_to_agent'");

    expect(constantsSource).toContain("BILL_PAYMENT: 'bill_payment'");
  });

  test("activates only the certified payment flow types", () => {
    expect(migration100).toContain("transaction_type = 'pay_to_agent'");

    expect(migration100).toContain("transaction_type = 'merchant_payment'");

    expect(migration100).not.toContain("transaction_type = 'bill_payment'");

    expect(migration100).toContain("pay_to_agent_step_count <> 7");

    expect(migration100).toContain("pay_to_merchant_step_count <> 6");
  });

  test("Admin UI keeps Pay to Agent distinct from future Bill Payment", () => {
    expect(adminPagesSource).toContain(
      '<option value="pay_to_agent">Pay to Agent</option>',
    );

    expect(adminPagesSource).not.toContain(
      '<option value="pay_to_agent">Bill Payment</option>',
    );

    expect(adminPagesSource).not.toContain('<option value="bill_payment">');
  });

  test("runtime Pay to Agent paths no longer use bill_payment", () => {
    expect(transactionRouteSource).not.toContain('"bill_payment"');

    expect(transactionControllerSource).not.toContain('"bill_payment"');

    expect(postingSource).not.toContain('"bill_payment"');

    expect(postingSource).toContain('"pay_to_agent"');
  });
});
