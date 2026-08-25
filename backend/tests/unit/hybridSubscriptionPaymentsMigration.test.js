const fs = require("fs");
const path = require("path");

describe("hybrid subscription payment migration", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "../../migrations/101_hybrid_subscription_payments.sql",
    ),
    "utf8",
  );

  test("preserves manual MoMo while adding Paystack provider metadata", () => {
    expect(source).toContain("payment_provider IN (");

    expect(source).toContain("'manual_momo'");

    expect(source).toContain("'paystack'");

    expect(source).toContain("provider_reference VARCHAR(120)");

    expect(source).toContain("expected_amount_minor BIGINT");

    expect(source).toContain("entitlement_base_expires_at TIMESTAMPTZ");

    expect(source).toContain("entitlement_base_captured BOOLEAN");

    expect(source).toContain("fulfilled_at TIMESTAMPTZ");
  });

  test("allows Paystack rows without inventing a manual MoMo reference", () => {
    const drops =
      source.match(/ALTER COLUMN momo_reference DROP NOT NULL/g) || [];

    expect(drops).toHaveLength(2);

    expect(source).toContain("subscription_payments_manual_reference_check");

    expect(source).toContain(
      "personal_subscription_payments_manual_reference_check",
    );
  });

  test("provider references are unique for Business and Personal payments", () => {
    expect(source).toContain("idx_subscription_payments_provider_reference");

    expect(source).toContain(
      "idx_personal_subscription_payments_provider_reference",
    );
  });
});
