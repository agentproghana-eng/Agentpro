-- Scale-safe chronological history indexes.
--
-- Cursor endpoints order by:
--   created_at DESC, id DESC
--
-- Tenant/actor columns lead the index so normal AgentPro authorization
-- scopes can seek directly into the caller's history instead of scanning
-- the global transaction or notification history.

CREATE INDEX IF NOT EXISTS
  idx_transactions_agent_history_cursor
ON transactions (
  agent_id,
  created_at DESC,
  id DESC
);

CREATE INDEX IF NOT EXISTS
  idx_transactions_company_history_cursor
ON transactions (
  company_id,
  created_at DESC,
  id DESC
);

CREATE INDEX IF NOT EXISTS
  idx_transactions_branch_history_cursor
ON transactions (
  branch_id,
  created_at DESC,
  id DESC
);

CREATE INDEX IF NOT EXISTS
  idx_transactions_global_history_cursor
ON transactions (
  created_at DESC,
  id DESC
);

CREATE INDEX IF NOT EXISTS
  idx_notifications_user_history_cursor
ON notifications (
  user_id,
  created_at DESC,
  id DESC
);

CREATE INDEX IF NOT EXISTS
  idx_notifications_user_unread_history_cursor
ON notifications (
  user_id,
  created_at DESC,
  id DESC
)
WHERE is_read = FALSE;
