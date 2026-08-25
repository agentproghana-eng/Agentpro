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
  test("Business reconciliation queue is superuser-only and Paystack-only", () => {
    const route = backendSource("src/routes/subscription.routes.js");

    const controller = backendSource(
      "src/controllers/subscriptionController.js",
    );

    expect(route).toContain("'/reconciliation-payments'");

    expect(route).toContain("authorize('superuser')");

    expect(controller).toContain("exports.listReconciliationPayments");

    expect(controller).toContain("sp.payment_provider = 'paystack'");

    expect(controller).toContain("sp.reconciliation_required = TRUE");
  });

  test("Personal reconciliation queue is superuser-only and Paystack-only", () => {
    const route = backendSource("src/routes/personalSubscription.routes.js");

    const controller = backendSource(
      "src/controllers/personalSubscriptionController.js",
    );

    expect(route).toContain("'/reconciliation-payments'");

    expect(route).toContain("authorize('superuser')");

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
    const app = repoSource("admin_portal/src/App.jsx");

    expect(app).toContain("'/subscriptions/pending-payments'");

    expect(app).toContain("'/personal-subscription/pending-payments'");

    expect(app).toContain("'/subscriptions/reconciliation-payments'");

    expect(app).toContain("'/personal-subscription/reconciliation-payments'");

    expect(app).toContain("Business — Manual MoMo");

    expect(app).toContain("Personal — Manual MoMo");

    expect(app).toContain("Paystack Reconciliation Required");
  });

  test("Admin never exposes manual approve or reject as a Paystack reconciliation action", () => {
    const app = repoSource("admin_portal/src/App.jsx");

    expect(app).toContain("payment.payment_provider === 'manual_momo'");

    expect(app).toContain("No approve/reject action is available for");

    expect(app).toContain("Paystack charges.");
  });
});
