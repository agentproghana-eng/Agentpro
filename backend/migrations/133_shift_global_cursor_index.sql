-- Global closed-shift cursor index for superuser reconciliation history.
-- Superusers are not company-scoped, so the company/agent/branch indexes
-- from migration 132 cannot cover the unfiltered global cursor path.

CREATE INDEX IF NOT EXISTS idx_shifts_global_closed_cursor
  ON shifts (
    closed_at DESC,
    id DESC
  )
  WHERE status = 'closed';
