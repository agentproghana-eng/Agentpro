-- Scale-safe staff-management cursor access paths.
-- Legacy page-number pagination remains supported separately.

CREATE INDEX IF NOT EXISTS idx_users_created_cursor
  ON users (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_users_company_created_cursor
  ON users (company_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_users_company_role_created_cursor
  ON users (company_id, role, created_at DESC, id DESC);
