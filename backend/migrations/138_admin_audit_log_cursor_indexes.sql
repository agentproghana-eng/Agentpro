CREATE INDEX IF NOT EXISTS idx_audit_logs_created_cursor
  ON audit_logs (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created_cursor
  ON audit_logs (company_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_cursor
  ON audit_logs (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_cursor
  ON audit_logs (action, created_at DESC, id DESC);
