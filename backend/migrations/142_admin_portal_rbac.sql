-- AgentPro Admin Portal role separation.
--
-- These roles are platform-administration identities only. They are not
-- Mobile Money business roles and carry no company membership implicitly.
--
-- All Admin Portal roles are protected by the same durable MFA assurance
-- used by superuser sessions.

ALTER TYPE user_role
  ADD VALUE IF NOT EXISTS 'admin_support';

ALTER TYPE user_role
  ADD VALUE IF NOT EXISTS 'admin_operations';

ALTER TYPE user_role
  ADD VALUE IF NOT EXISTS 'admin_finance';

ALTER TYPE user_role
  ADD VALUE IF NOT EXISTS 'admin_content';
