-- Role-aware Business USSD Flow resolution.
--
-- Agent, EVD and Merchant remain Business Mode roles.
-- Subscriber/Personal execution is intentionally unaffected.
--
-- Existing Business flows predate role-awareness, so NULL is interpreted
-- as Agent during rollout. New Business flows should persist an explicit
-- business_sim_role.

ALTER TABLE ussd_flows
  ADD COLUMN IF NOT EXISTS business_sim_role TEXT;

ALTER TABLE ussd_flows
  DROP CONSTRAINT IF EXISTS ussd_flows_business_sim_role_check;

ALTER TABLE ussd_flows
  ADD CONSTRAINT ussd_flows_business_sim_role_check
  CHECK (
    business_sim_role IS NULL
    OR business_sim_role IN (
      'agent',
      'evd',
      'merchant'
    )
  );

-- Existing Company-owned Business flows are canonical Agent flows.
UPDATE ussd_flows
SET business_sim_role = 'agent'
WHERE company_id IS NOT NULL
  AND owner_user_id IS NULL
  AND business_sim_role IS NULL;

-- Global flows that are registered as Business capabilities are also
-- existing Agent flows unless explicitly reconfigured later.
UPDATE ussd_flows AS flow
SET business_sim_role = 'agent'
WHERE flow.company_id IS NULL
  AND flow.owner_user_id IS NULL
  AND flow.business_sim_role IS NULL
  AND EXISTS (
    SELECT 1
    FROM ussd_flow_capabilities AS capability
    WHERE capability.transaction_type =
      flow.transaction_type
      AND capability.account_mode = 'business'
  );

-- Rebuild Business uniqueness to include the operational SIM role.
-- Personal uniqueness remains unchanged.

DROP INDEX IF EXISTS idx_ussd_flows_global_unique;

CREATE UNIQUE INDEX idx_ussd_flows_global_unique
  ON ussd_flows (
    provider,
    transaction_type,
    COALESCE(business_sim_role, 'agent'),
    COALESCE(bundle_category, ''),
    COALESCE(recipient_mode, '')
  )
  WHERE company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = TRUE;

DROP INDEX IF EXISTS idx_ussd_flows_company_unique;

CREATE UNIQUE INDEX idx_ussd_flows_company_unique
  ON ussd_flows (
    company_id,
    provider,
    transaction_type,
    COALESCE(business_sim_role, 'agent'),
    COALESCE(bundle_category, ''),
    COALESCE(recipient_mode, '')
  )
  WHERE company_id IS NOT NULL
    AND owner_user_id IS NULL
    AND is_active = TRUE;

DROP INDEX IF EXISTS idx_ussd_flows_resolution;

CREATE INDEX idx_ussd_flows_resolution
  ON ussd_flows (
    provider,
    transaction_type,
    business_sim_role,
    bundle_category,
    recipient_mode
  )
  WHERE is_active = TRUE;

COMMENT ON COLUMN ussd_flows.business_sim_role IS
  'Business Mode operational SIM role: agent, evd or merchant. Existing NULL Business rows are interpreted as agent during rollout.';
