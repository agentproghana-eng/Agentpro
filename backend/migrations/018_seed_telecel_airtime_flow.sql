-- Seeds the Telecel Airtime USSD flow, mapped step-by-step from live
-- device screenshots (dial *110# through PIN prompt). Telecel had no
-- Flow Builder entries at all before this - every prior seed
-- migration (012, 015) is MTN-only.
--
-- IMPORTANT: success_markers/failure_markers below are NOT confirmed
-- against a real completed transaction - the source screenshots only
-- went as far as the PIN prompt, never an actual success or failure
-- result screen. They're set to broad, generic terms as a reasonable
-- starting point, but must be verified (and corrected if needed)
-- against a real live test before this can be trusted not to hang
-- the same way the original MTN Cash In marker-mismatch bug did.
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'telecel', 'airtime', '*110#',
  ARRAY['successful', 'received'],
  ARRAY['failed', 'insufficient', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='telecel' AND transaction_type='airtime' AND company_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['3 airtime or data sales'], 'send_digit', '3'),
  (2, ARRAY['1 airtime sales'], 'send_digit', '1'),
  (3, ARRAY['enter phone number'], 'send_customer_phone', NULL),
  (4, ARRAY['re-enter phone number'], 'send_customer_phone', NULL),
  (5, ARRAY['enter amount'], 'send_amount', NULL),
  (6, ARRAY['enter operator id'], 'send_operator_id', NULL),
  (7, ARRAY['enter pin to confirm'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='telecel' AND f.transaction_type='airtime' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);
