-- Superuser authenticator-app MFA foundation.
--
-- TOTP secrets are never stored in plaintext. Application code encrypts
-- the authenticator secret with AES-256-GCM before persistence.
--
-- Recovery credentials are random high-entropy one-time values; only
-- keyed hashes are persisted.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_totp_secret_enc TEXT,
  ADD COLUMN IF NOT EXISTS mfa_recovery_code_hashes JSONB
    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mfa_last_totp_counter BIGINT;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_users_mfa_recovery_codes_array;

ALTER TABLE users
  ADD CONSTRAINT chk_users_mfa_recovery_codes_array
  CHECK (
    jsonb_typeof(mfa_recovery_code_hashes) = 'array'
  )
  NOT VALID;

ALTER TABLE users
  VALIDATE CONSTRAINT chk_users_mfa_recovery_codes_array;

COMMENT ON COLUMN users.mfa_enabled IS
  'Whether authenticator MFA is active for this account. Mandatory for superuser portal access.';

COMMENT ON COLUMN users.mfa_enabled_at IS
  'Timestamp when authenticator MFA enrollment was confirmed.';

COMMENT ON COLUMN users.mfa_totp_secret_enc IS
  'Versioned AES-256-GCM encrypted TOTP secret. Never plaintext.';

COMMENT ON COLUMN users.mfa_recovery_code_hashes IS
  'Keyed hashes of unused one-time MFA recovery codes. Raw recovery codes are never persisted.';

COMMENT ON COLUMN users.mfa_last_totp_counter IS
  'Highest successfully accepted RFC 6238 counter. Prevents reuse of an authenticator code.';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_users_mfa_totp_counter_nonnegative;

ALTER TABLE users
  ADD CONSTRAINT chk_users_mfa_totp_counter_nonnegative
  CHECK (
    mfa_last_totp_counter IS NULL
    OR mfa_last_totp_counter >= 0
  )
  NOT VALID;

ALTER TABLE users
  VALIDATE CONSTRAINT chk_users_mfa_totp_counter_nonnegative;

-- Durable sessions issued after successful superuser MFA carry explicit
-- server-side MFA assurance. Existing sessions intentionally remain NULL
-- so deployment immediately forces superusers through fresh MFA login.
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_users_mfa_enabled_material;

ALTER TABLE users
  ADD CONSTRAINT chk_users_mfa_enabled_material
  CHECK (
    mfa_enabled = FALSE
    OR (
      mfa_enabled_at IS NOT NULL
      AND mfa_totp_secret_enc IS NOT NULL
      AND mfa_last_totp_counter IS NOT NULL
    )
  )
  NOT VALID;

ALTER TABLE users
  VALIDATE CONSTRAINT chk_users_mfa_enabled_material;

COMMENT ON COLUMN refresh_tokens.mfa_verified_at IS
  'Timestamp proving this durable session was issued only after successful superuser MFA.';
