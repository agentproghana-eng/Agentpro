const fs = require("fs");
const path = require("path");

function backendSource(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../..", relativePath), "utf8");
}

function repoSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, "../../..", relativePath),
    "utf8",
  );
}

describe("subscription admin payment operations contracts", () => {
  test("Business reconciliation queue is finance-admin protected and Paystack-only", () => {
    const route = backendSource("src/routes/subscription.routes.js");

    const controller = backendSource(
      "src/controllers/subscriptionController.js",
    );

    expect(route).toContain("'/reconciliation-payments'");

    expect(route).toContain("authorize('superuser', 'admin_finance')");

    expect(controller).toContain("exports.listReconciliationPayments");

    expect(controller).toContain("sp.payment_provider = 'paystack'");

    expect(controller).toContain("sp.reconciliation_required = TRUE");
  });

  test("Personal reconciliation queue is finance-admin protected and Paystack-only", () => {
    const route = backendSource("src/routes/personalSubscription.routes.js");

    const controller = backendSource(
      "src/controllers/personalSubscriptionController.js",
    );

    expect(route).toContain("'/reconciliation-payments'");

    expect(route).toContain("authorize('superuser', 'admin_finance')");

    expect(controller).toContain("exports.listReconciliationPayments");

    expect(controller).toContain("p.payment_provider = 'paystack'");

    expect(controller).toContain("p.reconciliation_required = TRUE");
  });

  test("captured amount or currency mismatch is reconciled instead of hidden as provider failure", () => {
    const service = backendSource(
      "src/services/paystackSubscriptionService.js",
    );

    expect(service).toContain("markProviderMismatchForReconciliation");

    expect(service).toContain("provider_status = 'success'");

    expect(service).toContain("reconciliation_required = TRUE");

    expect(service).toContain('verificationIssue: "amount_currency_mismatch"');
  });

  test("Admin surfaces Business and Personal manual queues plus reconciliation", () => {
    const subscriptions = repoSource(
      "admin_portal/src/features/subscriptions/SubscriptionsPage.jsx",
    );

    expect(subscriptions).toContain("'/subscriptions/pending-payments'");

    expect(subscriptions).toContain("'/personal-subscription/pending-payments'");

    expect(subscriptions).toContain("'/subscriptions/reconciliation-payments'");

    expect(subscriptions).toContain("'/personal-subscription/reconciliation-payments'");

    expect(subscriptions).toContain("Business — Manual MoMo");

    expect(subscriptions).toContain("Personal — Manual MoMo");

    expect(subscriptions).toContain("Paystack Reconciliation Required");
  });

  test("Admin never exposes manual approve or reject as a Paystack reconciliation action", () => {
    const subscriptions = repoSource(
      "admin_portal/src/features/subscriptions/SubscriptionsPage.jsx",
    );

    expect(subscriptions).toContain("payment.payment_provider === 'manual_momo'");

    expect(subscriptions).toContain("No approve/reject action is available for");

    expect(subscriptions).toContain("Paystack charges.");
  });
});
