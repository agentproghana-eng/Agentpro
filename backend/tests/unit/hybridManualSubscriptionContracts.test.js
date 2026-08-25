const fs = require("fs");
const path = require("path");

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../..", relativePath), "utf8");
}

describe("hybrid manual subscription contracts", () => {
  test("Business manual submission blocks pending and submitted sibling attempts", () => {
    const controller = source("src/controllers/subscriptionController.js");

    expect(controller).toContain("status IN ('pending', 'submitted')");

    expect(controller).toContain("'manual_momo'");

    expect(controller).toContain("entitlement_base_captured");
  });

  test("Personal manual submission blocks pending and submitted sibling attempts", () => {
    const controller = source(
      "src/controllers/personalSubscriptionController.js",
    );

    expect(controller).toContain("status IN ('pending', 'submitted')");

    expect(controller).toContain("'manual_momo'");

    expect(controller).toContain("entitlement_base_captured");
  });

  test("Business manual approval uses shared activation and rejects Paystack manual review", () => {
    const controller = source("src/controllers/subscriptionController.js");

    expect(controller).toContain("activateBusinessSubscription");

    expect(controller).toContain("providerStatus: 'manual_verified'");

    expect(controller).toContain("payment.payment_provider === 'paystack'");
  });

  test("Personal manual approval uses shared activation and rejects Paystack manual review", () => {
    const controller = source(
      "src/controllers/personalSubscriptionController.js",
    );

    expect(controller).toContain("activatePersonalSubscription");

    expect(controller).toContain("providerStatus: 'manual_verified'");

    expect(controller).toContain("payment.payment_provider === 'paystack'");
  });

  test("superuser pending queues contain manual MoMo payments only", () => {
    const business = source("src/controllers/subscriptionController.js");

    const personal = source(
      "src/controllers/personalSubscriptionController.js",
    );

    expect(business).toContain("sp.payment_provider = 'manual_momo'");

    expect(personal).toContain("p.payment_provider = 'manual_momo'");
  });
});
