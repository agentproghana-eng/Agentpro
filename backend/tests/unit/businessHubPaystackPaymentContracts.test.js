const fs = require("fs");
const path = require("path");

function source(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, "../../..", relativePath),
    "utf8",
  );
}

describe("Business Hub Paystack payment contracts", () => {
  const migration = source(
    "backend/migrations/115_business_hub_paystack_payments.sql",
  );
  const marketplace = source("backend/src/routes/marketplace.routes.js");
  const webhook = source(
    "backend/src/controllers/paystackWebhookController.js",
  );
  const fulfillment = source(
    "backend/src/services/businessHubPaystackPaymentService.js",
  );
  const admin = source("backend/src/routes/admin.routes.js");

  test("adds provider-safe Business Hub payment fields", () => {
    expect(migration).toContain("payment_provider");
    expect(migration).toContain("provider_reference");
    expect(migration).toContain("expected_amount_minor");
    expect(migration).toContain("reconciliation_required");
    expect(migration).toContain("fulfilled_at");
    expect(migration).toContain("idx_ad_payments_provider_reference");
  });

  test("initializes Paystack from server-owned amount_due", () => {
    expect(marketplace).toContain("/:ad_id/payment/paystack/initialize");
    expect(marketplace).toContain("amountToMinorUnits(amountDue)");
    expect(marketplace).toContain('payment_kind: "business_hub"');
    expect(marketplace).toContain("APG-BHUB-${uuidv4()}");
    expect(marketplace).toContain("amount_due");
  });

  test("verifies provider response before publication", () => {
    expect(marketplace).toContain("/:ad_id/payment/paystack/verify/:reference");
    expect(marketplace).toContain("verifyTransaction(reference)");
    expect(fulfillment).toContain('providerStatus !== "success"');
    expect(fulfillment).toContain('currency !== "GHS"');
    expect(fulfillment).toContain("amountMinor !== expectedMinor");
    expect(fulfillment).toContain("status = 'active'");
  });

  test("webhook routes Business Hub charges to idempotent fulfillment", () => {
    expect(webhook).toContain('paymentKind === "business_hub"');
    expect(webhook).toContain('reference.startsWith("APG-BHUB-")');
    expect(webhook).toContain("fulfillBusinessHubPaystackTransaction");
    expect(fulfillment).toContain('outcome: "already_fulfilled"');
    expect(fulfillment).toContain('payment.status !== "pending"');
  });

  test("admin manual publish cannot verify a Paystack row", () => {
    expect(admin).toContain("payment_provider = 'manual_momo'");
  });

  test("manual fallback uses Transaction ID terminology", () => {
    expect(marketplace).toContain("req.body.transaction_id");
    expect(marketplace).toContain(
      "Transaction ID and payment phone are required",
    );
    expect(marketplace).toContain(
      "Transaction ID submitted for manual verification",
    );
  });
});
