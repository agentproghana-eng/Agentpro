-- P0 commercial-launch safety: fail closed for unvalidated AT Money
-- automation.
--
-- Migration 053 deliberately left AT Money Agent Flow Builder automation
-- unseeded until the live *110# screen text could be verified.
--
-- Historical bootstrap code nevertheless created legacy ussd_templates
-- using old *500# concatenated-dial assumptions. A legacy template is enough
-- for the transaction controller to consider automation available, so those
-- rows must not remain active in a commercial deployment.
--
-- Do not seed replacement AT Money flows here. A later migration may add
-- only flows whose exact live *110# prompts and result markers have been
-- validated on a physical AT Money Agent SIM.

UPDATE ussd_templates
SET
  is_active = FALSE,
  updated_at = NOW()
WHERE provider = 'at_money'
  AND is_active = TRUE;

-- Migration 053 never seeded global AT Money Flow Builder rows, but disable
-- any historical/global rows defensively. Company/user-owned custom flows
-- are deliberately not modified here.
UPDATE ussd_flows
SET
  is_active = FALSE,
  updated_at = NOW()
WHERE provider = 'at_money'
  AND company_id IS NULL
  AND owner_user_id IS NULL
  AND is_active = TRUE;
