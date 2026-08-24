-- Quick Action preferences by operational SIM role.
--
-- Agent, EVD and Merchant are all Business Mode roles.
-- Subscriber remains the consumer/Personal-mode role.
--
-- Existing columns remain intact for backward compatibility:
--   agent_quick_actions
--   personal_quick_actions
--
-- New Business roles get their own independent layouts because their
-- provider menus are not interchangeable.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS evd_quick_actions
  JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS merchant_quick_actions
  JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN users.evd_quick_actions IS
  'Provider-keyed EVD Business dashboard Quick Actions. Maximum 9 actions per provider.';

COMMENT ON COLUMN users.merchant_quick_actions IS
  'Provider-keyed Merchant Business dashboard Quick Actions. Maximum 9 actions per provider.';
