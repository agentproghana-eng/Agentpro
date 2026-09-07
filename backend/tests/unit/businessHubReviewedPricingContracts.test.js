const fs = require("fs");
const path = require("path");

function source(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, "../../..", relativePath),
    "utf8"
  );
}

describe("Business Hub reviewed pricing contracts", () => {
  const migration = source(
    "backend/migrations/114_business_hub_reviewed_pricing_notifications.sql"
  );

  const admin = source(
    "backend/src/routes/admin.routes.js"
  );

  const marketplace = source(
    "backend/src/routes/marketplace.routes.js"
  );

  test("preserves submitted pricing and adds reviewed pricing", () => {
    expect(migration).toContain(
      "admin_assessed_value"
    );

    expect(migration).toContain(
      "amount_due"
    );

    expect(migration).toContain(
      "pricing_adjustment_reason"
    );

    expect(migration).toContain(
      "payment_request_version"
    );

    expect(migration).toContain(
      "WHERE status = 'pending_payment'"
    );
  });

  test("admin approval is locked, audited and outboxed", () => {
    expect(admin).toContain(
      "action === 'approve_review'"
    );

    expect(admin).toContain(
      "FROM advertisements"
    );

    expect(admin).toContain(
      "FOR UPDATE"
    );

    expect(admin).toContain(
      "admin_assessed_value = $1"
    );

    expect(admin).toContain(
      "amount_due = $2"
    );

    expect(admin).toContain(
      "payment_request_version ="
    );

    expect(admin).toContain(
      "BUSINESS_HUB_PAYMENT_REQUESTED"
    );

    expect(admin).toContain(
      "notification.business_hub.payment_required"
    );

    expect(admin).toContain(
      "dbClient: client"
    );

    expect(admin).toContain(
      "strict: true"
    );
  });

  test("pricing changes require an administrator reason", () => {
    expect(admin).toContain(
      "pricingChanged"
    );

    expect(admin).toContain(
      "An adjustment reason is required"
    );
  });

  test("user payment uses amount_due rather than declared-price fee", () => {
    const paymentStart =
      marketplace.indexOf(
        "// Submit payment for an administrator-approved"
      );

    expect(paymentStart).toBeGreaterThanOrEqual(0);

    const paymentSection =
      marketplace.slice(paymentStart);

    expect(paymentSection).toContain(
      "amount_due"
    );

    expect(paymentSection).toContain(
      'ad.status !== "pending_payment"'
    );

    expect(paymentSection).toContain(
      "FOR UPDATE"
    );

    expect(paymentSection).toContain(
      "amountDue.toFixed(2)"
    );

    expect(paymentSection).not.toContain(
      "ad.rows[0].publishing_fee"
    );
  });

  test("duplicate pending payment references fail closed", () => {
    expect(marketplace).toContain(
      "A manual payment transaction ID is already awaiting verification"
    );

    expect(marketplace).toContain(
      "AND status = 'pending'"
    );
  });

  test("publish requires a pending payment matching amount due", () => {
    expect(admin).toContain(
      "User has not submitted a manual payment transaction ID"
    );

    expect(admin).toContain(
      "Submitted payment amount does not match the approved amount due"
    );

    expect(admin).toContain(
      "payment_provider = 'manual_momo'"
    );

    expect(admin).toContain(
      "status = 'verified'"
    );

    expect(admin).toContain(
      "status = 'active'"
    );
  });

  test("payment verification queues all required delivery channels", () => {
    expect(admin).toContain(
      "notification.business_hub.payment_confirmed"
    );

    expect(admin).toContain(
      "sms.business_hub.payment_confirmed"
    );

    expect(admin).toContain(
      "email.business_hub.payment_confirmed"
    );

    expect(admin).not.toContain(
      "sendAdPaymentConfirmedSMS("
    );

    expect(admin).not.toContain(
      "await sendAdNotification("
    );
  });
});
