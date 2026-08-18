-- Retry-safe Personal transaction initiation.
--
-- Existing historical rows remain NULL. Every new API-created Personal
-- transaction is required by the route to carry a client-generated UUID.
--
-- The fingerprint is a SHA-256 digest of the canonical initiation request.
-- It lets the server distinguish a legitimate replay from accidental or
-- malicious reuse of the same UUID with different transaction data.

ALTER TABLE personal_transactions
  ADD COLUMN IF NOT EXISTS client_operation_id UUID;

ALTER TABLE personal_transactions
  ADD COLUMN IF NOT EXISTS client_operation_fingerprint VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_personal_transaction_operation_fingerprint'
      AND conrelid = 'personal_transactions'::regclass
  ) THEN
    ALTER TABLE personal_transactions
      ADD CONSTRAINT chk_personal_transaction_operation_fingerprint
      CHECK (
        client_operation_fingerprint IS NULL
        OR client_operation_fingerprint ~ '^[0-9a-f]{64}$'
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_personal_transaction_operation_pair'
      AND conrelid = 'personal_transactions'::regclass
  ) THEN
    ALTER TABLE personal_transactions
      ADD CONSTRAINT chk_personal_transaction_operation_pair
      CHECK (
        (
          client_operation_id IS NULL
          AND client_operation_fingerprint IS NULL
        )
        OR
        (
          client_operation_id IS NOT NULL
          AND client_operation_fingerprint IS NOT NULL
        )
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_personal_transactions_user_client_operation
ON personal_transactions(user_id, client_operation_id)
WHERE client_operation_id IS NOT NULL;
