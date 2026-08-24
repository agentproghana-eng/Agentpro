-- Expand SIM Purpose from the original Agent/Personal distinction into
-- explicit operational SIM roles.
--
-- Backward compatibility:
--   * the historical enum value 'personal' remains valid temporarily so
--     older installed AgentPro versions do not fail during rollout;
--   * legacy rows remain 'personal' until the follow-up migration;
--   * the backend also normalizes incoming legacy 'personal' assignments
--     to 'subscriber'.
--
-- Provider is stored alongside the role so server-side validation can
-- enforce provider capabilities rather than trusting Flutter alone.

ALTER TYPE sim_purpose
  ADD VALUE IF NOT EXISTS 'subscriber';

ALTER TYPE sim_purpose
  ADD VALUE IF NOT EXISTS 'evd';

ALTER TYPE sim_purpose
  ADD VALUE IF NOT EXISTS 'merchant';

ALTER TABLE user_sim_purposes
  ADD COLUMN IF NOT EXISTS provider provider;

-- Historical 'personal' rows are migrated in a later migration.
-- PostgreSQL requires newly-added enum values to commit before use.

COMMENT ON COLUMN user_sim_purposes.provider IS
  'Detected telecom provider for this SIM assignment. Used to validate role compatibility such as MTN-only EVD.';

COMMENT ON COLUMN user_sim_purposes.purpose IS
  'Operational SIM role. Canonical values are agent, subscriber, evd and merchant. Historical personal is accepted only for rollout compatibility.';
