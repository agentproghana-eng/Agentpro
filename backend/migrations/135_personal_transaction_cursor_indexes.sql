-- Cursor indexes for Paid Personal transaction history.
-- Preserve all supported sort modes with id DESC as the stable tie-breaker.

CREATE INDEX IF NOT EXISTS idx_personal_transactions_user_created_desc_cursor
  ON personal_transactions (
    user_id,
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_personal_transactions_user_created_asc_cursor
  ON personal_transactions (
    user_id,
    created_at ASC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_personal_transactions_user_amount_desc_cursor
  ON personal_transactions (
    user_id,
    amount DESC NULLS FIRST,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_personal_transactions_user_amount_asc_cursor
  ON personal_transactions (
    user_id,
    amount ASC NULLS LAST,
    id DESC
  );
