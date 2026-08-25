-- Hybrid subscription payment foundation.
--
-- Manual MoMo remains supported and requires superuser verification.
-- Paystack payments are initialized by AgentPro and can be fulfilled
-- automatically after cryptographic provider verification.
--
-- The entitlement_base_expires_at snapshot prevents two payment attempts
-- created for the same subscription cycle from extending access twice.

ALTER TABLE subscription_payments
  ALTER COLUMN momo_reference DROP NOT NULL;

ALTER TABLE subscription_payments
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
  ADD COLUMN entitlement_base_expires_at TIMESTAMPTZ,
  ADD COLUMN entitlement_base_captured BOOLEAN
    NOT NULL DEFAULT FALSE,
  ADD COLUMN reconciliation_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN reconciliation_reason TEXT,
  ADD COLUMN fulfilled_at TIMESTAMPTZ;

ALTER TABLE subscription_payments
  ADD CONSTRAINT subscription_payments_provider_check
    CHECK (
      payment_provider IN (
        'manual_momo',
        'paystack'
      )
    ),
  ADD CONSTRAINT subscription_payments_manual_reference_check
    CHECK (
      payment_provider <> 'manual_momo'
      OR momo_reference IS NOT NULL
    ),
  ADD CONSTRAINT subscription_payments_paystack_reference_check
    CHECK (
      payment_provider <> 'paystack'
      OR provider_reference IS NOT NULL
    ),
  ADD CONSTRAINT subscription_payments_minor_amount_check
    CHECK (
      expected_amount_minor IS NULL
      OR expected_amount_minor > 0
    );

CREATE UNIQUE INDEX
  idx_subscription_payments_provider_reference
ON subscription_payments(provider_reference)
WHERE provider_reference IS NOT NULL;

CREATE INDEX
  idx_subscription_payments_provider_status
ON subscription_payments(
  payment_provider,
  status,
  submitted_at
);


ALTER TABLE personal_subscription_payments
  ALTER COLUMN momo_reference DROP NOT NULL;

ALTER TABLE personal_subscription_payments
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
  ADD COLUMN entitlement_base_expires_at TIMESTAMPTZ,
  ADD COLUMN entitlement_base_captured BOOLEAN
    NOT NULL DEFAULT FALSE,
  ADD COLUMN reconciliation_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN reconciliation_reason TEXT,
  ADD COLUMN fulfilled_at TIMESTAMPTZ;

ALTER TABLE personal_subscription_payments
  ADD CONSTRAINT personal_subscription_payments_provider_check
    CHECK (
      payment_provider IN (
        'manual_momo',
        'paystack'
      )
    ),
  ADD CONSTRAINT personal_subscription_payments_manual_reference_check
    CHECK (
      payment_provider <> 'manual_momo'
      OR momo_reference IS NOT NULL
    ),
  ADD CONSTRAINT personal_subscription_payments_paystack_reference_check
    CHECK (
      payment_provider <> 'paystack'
      OR provider_reference IS NOT NULL
    ),
  ADD CONSTRAINT personal_subscription_payments_minor_amount_check
    CHECK (
      expected_amount_minor IS NULL
      OR expected_amount_minor > 0
    );

CREATE UNIQUE INDEX
  idx_personal_subscription_payments_provider_reference
ON personal_subscription_payments(provider_reference)
WHERE provider_reference IS NOT NULL;

CREATE INDEX
  idx_personal_subscription_payments_provider_status
ON personal_subscription_payments(
  payment_provider,
  status,
  submitted_at
);
