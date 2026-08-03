-- Personal Subscriber payment submissions (GH₵5/month flat), mirroring
-- the existing subscription_payments / ad_payments pattern exactly:
-- submit a MoMo reference, a superuser verifies it, and only then does
-- the plan actually activate.
CREATE TABLE IF NOT EXISTS personal_subscription_payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id),
  amount            DECIMAL(10, 2) NOT NULL DEFAULT 5.00,
  momo_reference    VARCHAR(100) NOT NULL,
  payment_phone     VARCHAR(20),
  status            payment_status NOT NULL DEFAULT 'pending',
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at       TIMESTAMPTZ,
  verified_by       UUID REFERENCES users(id),
  rejection_reason  TEXT
);

CREATE INDEX IF NOT EXISTS idx_personal_subscription_payments_pending ON personal_subscription_payments(submitted_at) WHERE status = 'pending';
