-- Preserve known historical operational-notification dead letters without
-- misrepresenting them as successfully delivered.
--
-- Root cause:
-- notification.operational_incident deliveries failed with PostgreSQL 22P02
-- before migration 124 added 'operational_incident' to notification_type.
--
-- Safety:
-- only the exact legacy failure signature is retired. Any other dead letter
-- remains status='dead_letter' and continues to trigger operational alerts.

ALTER TABLE outbox_events
  DROP CONSTRAINT IF EXISTS chk_outbox_events_status;

ALTER TABLE outbox_events
  ADD CONSTRAINT chk_outbox_events_status
  CHECK (
    status IN (
      'pending',
      'processing',
      'processed',
      'dead_letter',
      'discarded'
    )
  );

ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS discarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discard_reason VARCHAR(100);

UPDATE outbox_events
SET
  status = 'discarded',
  discarded_at = NOW(),
  discard_reason = 'legacy_operational_incident_enum_failure',
  locked_at = NULL,
  locked_by = NULL,
  updated_at = NOW()
WHERE status = 'dead_letter'
  AND event_type = 'notification.operational_incident'
  AND aggregate_type = 'operational_incident'
  AND last_error_code = '22P02'
  AND attempts >= max_attempts
  AND dedupe_key LIKE 'operational-incident:%'
  AND updated_at < TIMESTAMPTZ '2026-09-13 13:02:09+00';
