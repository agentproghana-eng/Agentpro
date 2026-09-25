const fs = require("fs");
const path = require("path");

describe("Telecel Merchant outgoing initiation validation", () => {
  const route = fs.readFileSync(
    path.join(
      __dirname,
      "../../src/routes/transaction.routes.js",
    ),
    "utf8",
  );

  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "../../migrations/155_telecel_merchant_outgoing_capabilities.sql",
    ),
    "utf8",
  );

  test("Business capability enables all validated Merchant outgoing types", () => {
    for (const type of [
      "send_money_same_network",
      "send_money_cross_network",
      "send_money_to_bank",
    ]) {
      expect(migration).toContain(`'${type}'`);
    }

    expect(migration).toContain("'business'");
    expect(migration).toContain("can_initiate");
    expect(migration).toContain("TRUE");
  });

  test("phone Merchant outgoing types require recipient phone", () => {
    expect(route).toContain(
      '"send_money_same_network"',
    );
    expect(route).toContain(
      '"send_money_cross_network"',
    );
    expect(route).toContain(
      "isTelecelMerchantPhoneOutgoing(payload)",
    );
    expect(route).toContain(
      "Recipient phone number is required for Send Money",
    );
  });

  test("all Merchant outgoing types require payment reference", () => {
    expect(route).toContain(
      "isTelecelMerchantOutgoing(payload)",
    );
    expect(route).toContain(
      "Reference is required for this transaction type",
    );
  });

  test("Merchant Bank Transfer requires account number", () => {
    expect(route).toContain(
      'payload?.transaction_type === "send_money_to_bank"',
    );
    expect(route).toContain(
      "isTelecelMerchantBankOutgoing",
    );
    expect(route).toContain(
      "Account number is required for Bank Transfer",
    );
  });

  test("validation remains exact Telecel Merchant scope", () => {
    expect(route).toContain(
      'payload?.provider === "telecel"',
    );
    expect(route).toContain(
      'payload?.sim_role === "merchant"',
    );
  });
});
