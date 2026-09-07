-- Hybrid Business Hub payment foundation.
--
-- Paystack is the primary automated payment provider. Manual MoMo remains
-- available as a fallback and is still verified by an administrator.
--
-- Legacy momo_reference storage is retained for backward compatibility, but
-- the product-facing term for manual payments is "Transaction ID".

ALTER TABLE ad_payments
  ALTER COLUMN momo_reference DROP NOT NULL;

ALTER TABLE ad_payments
  ADD COLUMN payment_provider VARCHAR(20)
    NOT NULL DEFAULT 'manual_momo',
  ADD COLUMN provider_reference VARCHAR(120),
  ADD COLUMN provider_transaction_id VARCHAR(32),
  ADD COLUMN provider_status VARCHAR(50),
  ADD COLUMN provider_channel VARCHAR(50),
  ADD COLUMN provider_currency VARCHAR(10)
    NOT NULL DEFAULT 'GHS',
  ADD COLUMN expected_amount_minor BIGINT,
  ADD COLUMN authorization_url TEXT,
  ADD COLUMN reconciliation_required BOOLEAN
    NOT NULL DEFAULT FALSE,
  ADD COLUMN reconciliation_reason TEXT,
  ADD COLUMN fulfilled_at TIMESTAMPTZ;

ALTER TABLE ad_payments
  ADD CONSTRAINT ad_payments_provider_check
    CHECK (
      payment_provider IN (
        'manual_momo',
        'paystack'
      )
    ),
  ADD CONSTRAINT ad_payments_manual_transaction_check
    CHECK (
      payment_provider <> 'manual_momo'
      OR momo_reference IS NOT NULL
    ),
  ADD CONSTRAINT ad_payments_paystack_reference_check
    CHECK (
      payment_provider <> 'paystack'
      OR provider_reference IS NOT NULL
    ),
  ADD CONSTRAINT ad_payments_minor_amount_check
    CHECK (
      expected_amount_minor IS NULL
      OR expected_amount_minor > 0
    );

CREATE UNIQUE INDEX
  idx_ad_payments_provider_reference
ON ad_payments(provider_reference)
WHERE provider_reference IS NOT NULL;

CREATE INDEX
  idx_ad_payments_provider_status
ON ad_payments(
  payment_provider,
  status,
  submitted_at
);
