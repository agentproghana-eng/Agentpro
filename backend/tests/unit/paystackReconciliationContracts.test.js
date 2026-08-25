const fs = require("fs");
const path = require("path");

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../..", relativePath), "utf8");
}

describe("Paystack captured-money reconciliation contracts", () => {
  test("Business and Personal payment tables persist reconciliation state", () => {
    const migration = source("migrations/101_hybrid_subscription_payments.sql");

    expect(
      migration.match(
        /reconciliation_required BOOLEAN NOT NULL DEFAULT FALSE/g,
      ),
    ).toHaveLength(2);

    expect(migration.match(/reconciliation_reason TEXT/g)).toHaveLength(2);
  });

  test("successful stale Paystack money remains provider-successful and requires reconciliation", () => {
    const service = source("src/services/paystackSubscriptionService.js");

    expect(service).toContain("markSupersededPaymentForReconciliation");

    expect(service).toContain("provider_status = 'success'");

    expect(service).toContain("reconciliation_required = TRUE");

    expect(service).toContain("Refund or manual resolution is required.");

    expect(service).not.toContain("provider_status = 'superseded'");
  });

  test("replayed reconciliation callbacks cannot extend entitlement again", () => {
    const service = source("src/services/paystackSubscriptionService.js");

    expect(service).toContain("payment.reconciliation_required === true");

    expect(service).toContain(
      'normalizeStatus(payment.provider_status) === "success"',
    );

    expect(service).toContain('outcome: "reconciliation_required"');

    expect(service).toContain("reconciliationRequired: true");
  });

  test("reconciliation produces an explicit audit event", () => {
    const service = source("src/services/paystackSubscriptionService.js");

    expect(service).toContain(
      "PAYSTACK_SUBSCRIPTION_PAYMENT_RECONCILIATION_REQUIRED",
    );

    expect(service).toContain("reconciliation_required: true");
  });
});
