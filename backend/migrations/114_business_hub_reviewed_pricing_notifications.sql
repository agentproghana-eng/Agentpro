-- Business Hub reviewed pricing and payment notification foundation.
--
-- advertisements.price remains the user's declared public price.
-- advertisements.publishing_fee remains the original fee calculated from
-- that declared price at submission time.
--
-- Admin review records a separate assessed value and authoritative amount
-- due so under-declaration never destroys the originally submitted values.

ALTER TYPE notification_type
ADD VALUE IF NOT EXISTS 'ad_payment_required';

ALTER TYPE notification_type
ADD VALUE IF NOT EXISTS 'ad_payment_confirmed';

ALTER TABLE advertisements
  ADD COLUMN admin_assessed_value DECIMAL(15, 2),
  ADD COLUMN amount_due DECIMAL(10, 2),
  ADD COLUMN pricing_adjustment_reason TEXT,
  ADD COLUMN pricing_reviewed_by UUID
    REFERENCES users(id)
    ON DELETE SET NULL,
  ADD COLUMN pricing_reviewed_at TIMESTAMPTZ,
  ADD COLUMN payment_requested_at TIMESTAMPTZ,
  ADD COLUMN payment_request_version INTEGER
    NOT NULL
    DEFAULT 0;

ALTER TABLE advertisements
  ADD CONSTRAINT chk_advertisements_admin_assessed_value
  CHECK (
    admin_assessed_value IS NULL
    OR admin_assessed_value >= 0
  );

ALTER TABLE advertisements
  ADD CONSTRAINT chk_advertisements_amount_due
  CHECK (
    amount_due IS NULL
    OR amount_due >= 0
  );

ALTER TABLE advertisements
  ADD CONSTRAINT chk_advertisements_payment_request_version
  CHECK (payment_request_version >= 0);

-- Preserve already-approved listings created before this migration.
-- Their historical publishing_fee becomes the initial authoritative
-- amount due, without inventing an administrator identity.
UPDATE advertisements
SET
  admin_assessed_value =
    COALESCE(admin_assessed_value, price),
  amount_due =
    COALESCE(amount_due, publishing_fee, 0),
  pricing_reviewed_at =
    COALESCE(
      pricing_reviewed_at,
      updated_at,
      created_at
    ),
  payment_requested_at =
    COALESCE(
      payment_requested_at,
      updated_at,
      created_at
    ),
  payment_request_version =
    GREATEST(payment_request_version, 1)
WHERE status = 'pending_payment';

CREATE INDEX idx_advertisements_pending_payment_requested
  ON advertisements(payment_requested_at)
  WHERE status = 'pending_payment';
