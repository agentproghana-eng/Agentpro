const fs = require("fs");
const path = require("path");

describe("Telecel Merchant Check Balance execution boundary", () => {
  const controller = fs.readFileSync(
    path.join(
      __dirname,
      "../../src/controllers/transactionController.js",
    ),
    "utf8",
  );

  test("allows only exact Telecel Merchant balance enquiry as the observational exception", () => {
    expect(controller).toContain(
      'const isTelecelMerchantBalanceEnquiry =',
    );
    expect(controller).toMatch(
      /isTelecelMerchantBalanceEnquiry[\s\S]{0,220}businessSimRole === "merchant"[\s\S]{0,220}provider === "telecel"[\s\S]{0,220}transaction_type === "balance_enquiry"/,
    );
  });

  test("keeps the Merchant and EVD financial accounting guard", () => {
    expect(controller).toContain(
      '["evd", "merchant"].includes(businessSimRole)',
    );
    expect(controller).toContain(
      "!isValidatedTelecelMerchantECash",
    );
    expect(controller).toContain(
      "!isTelecelMerchantBalanceEnquiry",
    );
    expect(controller).toContain(
      "SIM_ROLE_ACCOUNTING_NOT_CONFIGURED",
    );
  });

  test("does not classify Merchant balance enquiry as E-Cash", () => {
    expect(controller).toMatch(
      /isValidatedTelecelMerchantECash[\s\S]{0,300}\["float_to_working", "working_to_float"\]/,
    );
  });

  test("does not enable Merchant Send Money through the balance exception", () => {
    const balanceBlock = controller.match(
      /const isTelecelMerchantBalanceEnquiry =[\s\S]*?;/,
    );

    expect(balanceBlock).not.toBeNull();
    expect(balanceBlock[0]).not.toContain("send_money");
    expect(balanceBlock[0]).not.toContain("bank");
  });
});
