const fs = require("fs");
const path = require("path");

const controller = fs.readFileSync(
  path.join(
    __dirname,
    "../../src/controllers/transactionController.js",
  ),
  "utf8",
);

describe("Telecel Merchant E-Cash controller boundary", () => {
  test("imports the dedicated Merchant E-Cash posting service", () => {
    expect(controller).toContain(
      'require("../services/telecelMerchantECashPostingService")',
    );
    expect(controller).toContain(
      "postTelecelMerchantECash",
    );
  });

  test("Merchant E-Cash eligibility is narrowly scoped", () => {
    expect(controller).toContain(
      'businessSimRole === "merchant"',
    );
    expect(controller).toContain(
      'provider === "telecel"',
    );
    expect(controller).toContain(
      '"float_to_working"',
    );
    expect(controller).toContain(
      '"working_to_float"',
    );
  });

  test("unvalidated Merchant accounting gate remains present", () => {
    expect(controller).toContain(
      "SIM_ROLE_ACCOUNTING_NOT_CONFIGURED",
    );
    expect(controller).toContain(
      '["evd", "merchant"].includes(businessSimRole)',
    );
  });

  test("dedicated Merchant E-Cash posting is dispatched", () => {
    expect(controller).toContain(
      "await postTelecelMerchantECash(",
    );
  });

  test("Merchant Send Money is not routed to Agent Send Money accounting", () => {
    expect(controller).not.toMatch(
      /businessSimRole\s*===\s*["']merchant["'][\s\S]{0,300}postSendMoney\(/,
    );
  });

  test("Merchant E-Cash is not routed to Agent Working/Float accounting", () => {
    expect(controller).not.toMatch(
      /businessSimRole\s*===\s*["']merchant["'][\s\S]{0,300}postWorkingFloatTransfer\(/,
    );
  });
});
