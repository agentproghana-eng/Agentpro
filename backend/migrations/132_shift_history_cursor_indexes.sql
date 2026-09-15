CREATE INDEX IF NOT EXISTS idx_shifts_company_closed_cursor
  ON shifts (
    company_id,
    closed_at DESC,
    id DESC
  )
  WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS idx_shifts_agent_closed_cursor
  ON shifts (
    agent_id,
    closed_at DESC,
    id DESC
  )
  WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS idx_shifts_branch_closed_cursor
  ON shifts (
    branch_id,
    closed_at DESC,
    id DESC
  )
  WHERE status = 'closed';
