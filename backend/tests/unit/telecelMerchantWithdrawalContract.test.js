const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");

const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Telecel Merchant Agent Till withdrawal contract", () => {
  const migration = read(
    "migrations/162_telecel_merchant_agent_till_withdrawal.sql",
  );
  const posting = read(
    "src/services/telecelMerchantOutgoingPostingService.js",
  );
  const controller = read("src/controllers/transactionController.js");

  test("seeds the live-confirmed eight-step Merchant withdrawal", () => {
    expect(migration).toContain("'cash_out'");
    expect(migration).toContain("ARRAY['withdraw cash']");
    expect(migration).toContain("'2'");
    expect(migration).toContain(
      "ARRAY['withdraw cash', 'from agent', 'from bank']",
    );
    expect(migration).toContain(
      "ARRAY['select option', 'agent till', 'agent short code']",
    );
    expect(migration).toContain("ARRAY['enter till number']");
    expect(migration).toContain("'send_customer_phone'::ussd_flow_action");
    expect(migration).toContain("ARRAY['enter amount']");
    expect(migration).toContain("'send_amount'::ussd_flow_action");
    expect(migration).toContain("ARRAY['enter operator id']");
    expect(migration).toContain("'send_operator_id'::ussd_flow_action");
    expect(migration).toContain("ARRAY['enter pin']");
    expect(migration).toContain("'pin_prompt'::ussd_flow_action");
    expect(migration).toContain("'business withdrawal'");
    expect(migration).toContain(
      "'enter 1 to confirm or 0 to cancel'",
    );
    expect(migration).toContain(
      "'auto_confirm_once'::ussd_flow_action",
    );
  });

  test("cash_out spends only the Merchant Working Account", () => {
    expect(posting).toContain('"cash_out"');
    expect(posting).toContain(
      "SET current_balance = current_balance - $1",
    );
    expect(posting).toContain(
      "AND balance_code = 'working_account'",
    );

    expect(controller).toContain(
      'tx.transaction_type === "cash_out"',
    );

    expect(controller).toContain(
      "postTelecelMerchantOutgoing(",
    );
  });

  test("Merchant withdrawal does not enter Agent accounting", () => {
    const merchantBlockStart = controller.indexOf(
      'tx.provider === "telecel" &&',
      controller.indexOf('tx.transaction_type === "send_money"'),
    );
    const merchantBlockEnd = controller.indexOf(
      '} else if (tx.transaction_type === "airtime")',
      merchantBlockStart,
    );
    const merchantBlock = controller.slice(
      merchantBlockStart,
      merchantBlockEnd,
    );

    expect(merchantBlock).toContain(
      'tx.transaction_type === "cash_out"',
    );
    expect(merchantBlock).toContain(
      "postTelecelMerchantOutgoing(",
    );
    expect(merchantBlock).not.toContain("postCashOut(");
    expect(merchantBlock).not.toContain(
      "calculateAndPostCommission(",
    );

    expect(posting).not.toContain("agent_cash_balances");
    expect(posting).not.toContain("agent_balance_movements");
    expect(posting).not.toContain("e_float_balance");
    expect(posting).not.toContain("commission_balance");
  });
});
