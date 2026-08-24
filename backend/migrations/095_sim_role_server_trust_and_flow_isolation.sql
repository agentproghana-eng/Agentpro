-- Harden Business SIM-role trust and isolate Personal Global flows.
--
-- Financial Business runtime must verify the claimed operational role
-- against the authenticated user's persisted physical-SIM assignment.
--
-- Personal Global rows keep business_sim_role NULL.
-- Business Global rows use an explicit Agent, EVD or Merchant role.

ALTER TABLE user_sim_purposes
  ADD COLUMN IF NOT EXISTS installation_id UUID;

ALTER TABLE user_sim_purposes
  ADD COLUMN IF NOT EXISTS sim_subscription_id INTEGER;

ALTER TABLE user_sim_purposes
  DROP CONSTRAINT IF EXISTS
    user_sim_purposes_sim_subscription_id_nonnegative;

ALTER TABLE user_sim_purposes
  ADD CONSTRAINT
    user_sim_purposes_sim_subscription_id_nonnegative
  CHECK (
    sim_subscription_id IS NULL
    OR sim_subscription_id >= 0
  );

CREATE INDEX IF NOT EXISTS
  idx_user_sim_purposes_fallback_identity
ON user_sim_purposes (
  user_id,
  installation_id,
  sim_subscription_id,
  sim_slot
)
WHERE installation_id IS NOT NULL
  AND sim_subscription_id IS NOT NULL;

-- Repair any Personal-only Global flow that may have been created
-- after Business-role support started defaulting new Global rows
-- to Agent.
UPDATE ussd_flows AS flow
SET business_sim_role = NULL
WHERE flow.company_id IS NULL
  AND flow.owner_user_id IS NULL
  AND flow.business_sim_role = 'agent'
  AND EXISTS (
    SELECT 1
    FROM ussd_flow_capabilities AS capability
    WHERE capability.transaction_type =
      flow.transaction_type
      AND capability.account_mode = 'personal'
      AND capability.is_active = TRUE
  )
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_capabilities AS capability
    WHERE capability.transaction_type =
      flow.transaction_type
      AND capability.account_mode = 'business'
      AND capability.is_active = TRUE
  );

-- NULL now means Personal Global, not legacy Agent.
-- This allows a Personal Global row and an Agent Business Global
-- row to coexist for the same provider/type/variant if a future
-- transaction type is enabled in both modes.
DROP INDEX IF EXISTS idx_ussd_flows_global_unique;

CREATE UNIQUE INDEX idx_ussd_flows_global_unique
  ON ussd_flows (
    provider,
    transaction_type,
    COALESCE(business_sim_role, 'personal'),
    COALESCE(bundle_category, ''),
    COALESCE(recipient_mode, '')
  )
  WHERE company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = TRUE;

COMMENT ON COLUMN user_sim_purposes.installation_id IS
  'Durable AgentPro installation identity used only when ICCID is unavailable.';

COMMENT ON COLUMN user_sim_purposes.sim_subscription_id IS
  'Android subscription identity used with installation_id and sim_slot when ICCID is unavailable.';
