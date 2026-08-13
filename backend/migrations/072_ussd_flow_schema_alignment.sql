-- Align the persisted USSD Flow schema with the runtime flow engine.
--
-- Runtime code already supports:
--   - send_selection
--   - bundle_category
--   - recipient_mode
--   - Global, Company and Personal ownership precedence
--
-- Earlier migrations did not fully persist those capabilities, which
-- could cause flow creation failures, uniqueness collisions and schema
-- drift as more provider flows are added.

-- send_selection is added by 035a_add_ussd_send_selection_action.sql
-- before migration 036, where the Telecel Data Bundle seed first uses it.

-- Optional flow discriminators. These allow multiple flows for the same
-- provider + transaction type when the actual USSD path differs by
-- bundle category or recipient mode.
ALTER TABLE ussd_flows
  ADD COLUMN IF NOT EXISTS bundle_category TEXT;

ALTER TABLE ussd_flows
  ADD COLUMN IF NOT EXISTS recipient_mode TEXT;

-- The original global index predates Personal flow ownership. Because a
-- Personal flow also has company_id NULL, the old predicate incorrectly
-- treated Personal rows as global rows and could block a Personal
-- override for a provider/type that already had a global default.
--
-- Rebuild all three ownership-tier indexes and include the optional flow
-- discriminators. COALESCE is deliberate: PostgreSQL otherwise treats
-- NULL values as distinct in unique indexes, allowing duplicate
-- "default" variants with NULL discriminator values.

DROP INDEX IF EXISTS idx_ussd_flows_global_unique;

CREATE UNIQUE INDEX idx_ussd_flows_global_unique
  ON ussd_flows (
    provider,
    transaction_type,
    COALESCE(bundle_category, ''),
    COALESCE(recipient_mode, '')
  )
  WHERE company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = true;

DROP INDEX IF EXISTS idx_ussd_flows_company_unique;

CREATE UNIQUE INDEX idx_ussd_flows_company_unique
  ON ussd_flows (
    company_id,
    provider,
    transaction_type,
    COALESCE(bundle_category, ''),
    COALESCE(recipient_mode, '')
  )
  WHERE company_id IS NOT NULL
    AND owner_user_id IS NULL
    AND is_active = true;

DROP INDEX IF EXISTS idx_ussd_flows_personal_unique;

CREATE UNIQUE INDEX idx_ussd_flows_personal_unique
  ON ussd_flows (
    owner_user_id,
    provider,
    transaction_type,
    COALESCE(bundle_category, ''),
    COALESCE(recipient_mode, '')
  )
  WHERE owner_user_id IS NOT NULL
    AND company_id IS NULL
    AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_ussd_flows_resolution
  ON ussd_flows (
    provider,
    transaction_type,
    bundle_category,
    recipient_mode
  )
  WHERE is_active = true;
