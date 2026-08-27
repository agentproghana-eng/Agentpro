-- Permanent account-deletion marker.
--
-- The users row is deliberately retained as a non-personal technical
-- identity because historical financial, audit, transaction, commission,
-- shift, wallet and payment records reference it.
--
-- Direct personal identifiers are removed by the account-deletion service.
-- A deleted account can never be reactivated.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_users_deleted_account_deactivated'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_users_deleted_account_deactivated
      CHECK (
        account_deleted_at IS NULL
        OR status = 'deactivated'
      )
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE users
  VALIDATE CONSTRAINT chk_users_deleted_account_deactivated;

CREATE INDEX IF NOT EXISTS
  idx_users_account_deleted_at
ON users(account_deleted_at)
WHERE account_deleted_at IS NOT NULL;

COMMENT ON COLUMN users.account_deleted_at IS
  'Permanent self-service account deletion timestamp. '
  'The technical user UUID remains only where required for retained '
  'financial, fraud-prevention, security and audit records.';
