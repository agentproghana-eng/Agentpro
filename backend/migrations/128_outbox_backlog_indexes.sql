-- Scale-safe operational outbox lookups.
--
-- Existing migration 091 already indexes:
--   pending dispatch by (available_at, created_at)
--   stale processing by locked_at
--
-- These additional partial indexes support:
--   oldest pending age without scanning the pending backlog
--   dead-letter telemetry without scanning processed history

CREATE INDEX IF NOT EXISTS idx_outbox_events_pending_created_at
    ON outbox_events (created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_outbox_events_dead_letter_created_at
    ON outbox_events (created_at)
    WHERE status = 'dead_letter';
