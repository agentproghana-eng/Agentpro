const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../src/routes/transaction.routes.js",
  ),
  "utf8",
);

describe("Telecel Merchant E-Cash minimum amount", () => {
  test("targets only Telecel Merchant internal transfers", () => {
    expect(source).toContain(
      "const isTelecelMerchantECashTransfer = (payload) =>",
    );
    expect(source).toContain(
      'payload?.provider === "telecel"',
    );
    expect(source).toContain(
      'payload?.sim_role === "merchant"',
    );
    expect(source).toContain(
      '["float_to_working", "working_to_float"].includes',
    );
  });

  test("rejects amounts below the live GHS 1 minimum", () => {
    expect(source).toContain(
      "if (isTelecelMerchantECashTransfer(req.body))",
    );
    expect(source).toContain("parsedAmount < 1");
    expect(source).toContain(
      "Minimum Telecel Merchant E-Cash transfer amount is GHS 1.00",
    );
  });
});
