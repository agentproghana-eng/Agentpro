-- Exact refresh-token identity.
--
-- Legacy refresh sessions stored only a bcrypt hash of the full JWT.
-- bcrypt considers at most the first 72 input bytes, while AgentPro
-- refresh JWTs for the same user share a long prefix before their unique
-- jti appears. Distinct sessions therefore cannot safely use bcrypt
-- comparison as their session identity.
--
-- New sessions persist a SHA-256 digest of the complete high-entropy
-- refresh credential and refresh authorization performs exact indexed
-- lookup by that digest.
--
-- Existing bcrypt-only sessions cannot be safely backfilled because the
-- raw credentials are intentionally not stored. Revoke them once at the
-- cutover so every surviving active session has been freshly issued by
-- the digest-aware application.

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS token_digest VARCHAR(64);

ALTER TABLE refresh_tokens
  DROP CONSTRAINT IF EXISTS chk_refresh_tokens_token_digest_hex;

ALTER TABLE refresh_tokens
  ADD CONSTRAINT chk_refresh_tokens_token_digest_hex
  CHECK (
    token_digest IS NULL
    OR token_digest ~ '^[0-9a-f]{64}$'
  )
  NOT VALID;

ALTER TABLE refresh_tokens
  VALIDATE CONSTRAINT chk_refresh_tokens_token_digest_hex;

-- Fail closed at migration time. Legacy active credentials cannot be
-- distinguished safely from sibling sessions that share bcrypt's
-- truncated input prefix.
UPDATE refresh_tokens
SET revoked_at = COALESCE(revoked_at, NOW())
WHERE token_digest IS NULL
  AND revoked_at IS NULL;

-- From this point onward the database itself refuses any new active
-- durable session that lacks exact refresh-token identity.
ALTER TABLE refresh_tokens
  DROP CONSTRAINT IF EXISTS chk_refresh_tokens_active_digest;

ALTER TABLE refresh_tokens
  ADD CONSTRAINT chk_refresh_tokens_active_digest
  CHECK (
    revoked_at IS NOT NULL
    OR token_digest IS NOT NULL
  )
  NOT VALID;

ALTER TABLE refresh_tokens
  VALIDATE CONSTRAINT chk_refresh_tokens_active_digest;

CREATE UNIQUE INDEX IF NOT EXISTS
  ux_refresh_tokens_token_digest
ON refresh_tokens (token_digest)
WHERE token_digest IS NOT NULL;

COMMENT ON COLUMN refresh_tokens.token_digest IS
  'SHA-256 digest of the complete refresh credential. Authoritative exact session lookup; raw refresh tokens are never persisted.';
