-- Cursor indexes for float movement and float request history.
-- Supports stable descending pagination using (created_at, id).

CREATE INDEX IF NOT EXISTS idx_float_movements_created_cursor
  ON float_movements (
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_float_movements_account_created_cursor
  ON float_movements (
    float_account_id,
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_float_requests_created_cursor
  ON float_requests (
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_float_requests_branch_created_cursor
  ON float_requests (
    branch_id,
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_float_requests_requester_created_cursor
  ON float_requests (
    requested_by,
    created_at DESC,
    id DESC
  );
