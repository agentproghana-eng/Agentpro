-- Separate 3x3 Quick Action preferences for Agent and Personal modes.
--
-- Example:
-- {
--   "mtn": ["cash_in", "cash_out"],
--   "telecel": ["cash_in", "data_bundle"]
-- }

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS agent_quick_actions JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS personal_quick_actions JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN users.agent_quick_actions IS
  'Provider-keyed Agent dashboard Quick Actions. Maximum 9 transaction types per provider.';

COMMENT ON COLUMN users.personal_quick_actions IS
  'Provider-keyed Personal dashboard Quick Actions. Maximum 9 transaction types per provider.';
