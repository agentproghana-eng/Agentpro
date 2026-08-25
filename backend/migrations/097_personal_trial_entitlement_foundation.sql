-- Durable Personal trial entitlement history.
--
-- Account creation and trial entitlement are deliberately separate.
-- Creating another email account must not automatically create another trial.
--
-- Identity claims contain only server-HMAC digests. Raw phone numbers,
-- installation identifiers, and SIM identifiers are never duplicated
-- into these tables.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS personal_trial_entitlements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  source      VARCHAR(40) NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT personal_trial_entitlement_source_valid
    CHECK (
      source IN (
        'registration',
        'personal_capability',
        'legacy_backfill',
        'manual_override'
      )
    ),

  CONSTRAINT personal_trial_entitlement_expiry_valid
    CHECK (expires_at > granted_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS
  uq_personal_trial_entitlement_user
ON personal_trial_entitlements(user_id)
WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS personal_trial_identity_claims (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entitlement_id  UUID NOT NULL
    REFERENCES personal_trial_entitlements(id)
    ON DELETE RESTRICT,
  claim_type      VARCHAR(30) NOT NULL,
  claim_hash      CHAR(64) NOT NULL,
  claim_version   INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT personal_trial_claim_type_valid
    CHECK (
      claim_type IN (
        'phone',
        'installation',
        'sim_iccid'
      )
    ),

  CONSTRAINT personal_trial_claim_hash_valid
    CHECK (
      claim_hash ~ '^[0-9a-f]{64}$'
    ),

  CONSTRAINT personal_trial_claim_version_valid
    CHECK (claim_version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS
  uq_personal_trial_identity_claim
ON personal_trial_identity_claims(
  claim_type,
  claim_hash,
  claim_version
);

CREATE INDEX IF NOT EXISTS
  idx_personal_trial_claim_entitlement
ON personal_trial_identity_claims(entitlement_id);

COMMENT ON TABLE personal_trial_entitlements IS
  'Durable Personal trial grants independent of account email.';

COMMENT ON TABLE personal_trial_identity_claims IS
  'Privacy-conscious HMAC identity claims used to prevent repeated Personal trials.';

COMMENT ON COLUMN personal_trial_identity_claims.claim_hash IS
  'Server-HMAC SHA-256 digest. Raw identity values must never be stored here.';

COMMENT ON COLUMN users.phone_verified_at IS
  'Server timestamp recording successful ownership verification of the current account phone.';
