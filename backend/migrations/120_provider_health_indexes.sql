-- Provider-health telemetry uses recent outcome time for terminal
-- transactions and recent creation time for inconclusive outcomes.
--
-- Keep these indexes narrow and partial so telemetry does not require
-- scanning the growing transaction tables.

CREATE INDEX IF NOT EXISTS
  idx_transactions_provider_health_completed
ON transactions (completed_at, provider)
WHERE
  status IN ('success', 'failed')
  AND completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  idx_transactions_provider_health_pending
ON transactions (created_at, provider)
WHERE status = 'pending_confirmation';

CREATE INDEX IF NOT EXISTS
  idx_personal_transactions_provider_health_completed
ON personal_transactions (completed_at, provider)
WHERE
  status IN ('success', 'failed')
  AND completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  idx_personal_transactions_provider_health_pending
ON personal_transactions (created_at, provider)
WHERE status = 'pending_confirmation';
