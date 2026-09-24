const fs = require("fs");
const path = require("path");

const read = (relativePath) =>
  fs.readFileSync(
    path.join(__dirname, "../..", relativePath),
    "utf8"
  );

describe("Telecel Merchant accounting validation gate", () => {
  const workingFloatPosting = read(
    "src/services/workingFloatPostingService.js"
  );

  const sendMoneyPosting = read(
    "src/services/sendMoneyPostingService.js"
  );

  test("E-Cash canonical directions remain distinct", () => {
    expect(workingFloatPosting).toContain(
      'transactionType !== "working_to_float"'
    );
    expect(workingFloatPosting).toContain(
      'transactionType !== "float_to_working"'
    );

    // Working Account -> Merchant Account / operational Float.
    expect(workingFloatPosting).toContain(
      'if (transactionType === "working_to_float")'
    );
    expect(workingFloatPosting).toContain(
      "workingBefore - amount"
    );
    expect(workingFloatPosting).toContain(
      "eFloatBefore + amount"
    );

    // Merchant Account / operational Float -> Working Account.
    expect(workingFloatPosting).toContain(
      "workingBefore + amount"
    );
    expect(workingFloatPosting).toContain(
      "eFloatBefore - amount"
    );
  });

  test("E-Cash posting has no physical cash mutation", () => {
    expect(workingFloatPosting).not.toContain(
      "getOrCreateAgentCashBalance"
    );
    expect(workingFloatPosting).not.toContain(
      "cash_at_hand"
    );
  });

  test("existing Working/Float service remains explicitly Agent scoped", () => {
    expect(workingFloatPosting).toContain(
      "Posts a confirmed Telecel Agent Move Money operation"
    );
    expect(workingFloatPosting).toContain(
      "agent_sim_wallets"
    );
    expect(workingFloatPosting).toContain(
      "agent_balance_movements"
    );
  });

  test("existing Send Money posting must not be reused blindly for Merchant", () => {
    expect(sendMoneyPosting).toContain(
      "Posts the agent-side accounting effect"
    );
    expect(sendMoneyPosting).toContain(
      "getOrCreateAgentCashBalance"
    );
    expect(sendMoneyPosting).toContain(
      "cashAfter"
    );
    expect(sendMoneyPosting).toContain(
      "cash_at_hand"
    );
  });

  test("Telecel Send Money currently has no provider fee posting here", () => {
    expect(sendMoneyPosting).toContain(
      'transaction.provider === "mtn"'
    );
    expect(sendMoneyPosting).toContain(
      "? money(transaction.fee || 0)"
    );
    expect(sendMoneyPosting).toContain(
      ": 0;"
    );
  });

  test("Merchant enablement requires dedicated validated accounting", () => {
    // This contract intentionally documents the current boundary:
    // Agent accounting exists, but Merchant accounting has not yet
    // been proven equivalent and must remain fail-closed.
    expect(sendMoneyPosting).not.toContain(
      "postTelecelMerchantSendMoney"
    );
    expect(workingFloatPosting).not.toContain(
      "postTelecelMerchantECash"
    );
  });
});
