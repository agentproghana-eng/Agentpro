-- Seeds global MTN Flow Builder entries for Pay to Agent (bill_payment)
-- and Pay to Merchant (merchant_payment). Unlike this session's other
-- flows, these match_all conditions are reconstructed from step
-- descriptions recorded earlier in the session rather than fresh
-- screenshots, so they are a best-effort guess and more likely than
-- most to need adjustment after a real device test.

-- ============================================================
-- Pay to Agent (bill_payment)
-- ============================================================
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'bill_payment', '*171#',
  ARRAY['payment made for'],
  ARRAY['failed', 'insufficient', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='bill_payment' AND company_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '1'),
  (2, ARRAY['pay to', '1) agent'], 'send_digit', '1'),
  (3, ARRAY['enter mobile number'], 'send_customer_phone', NULL),
  (4, ARRAY['repeat mobile number'], 'send_customer_phone', NULL),
  (5, ARRAY['enter amount'], 'send_amount', NULL),
  (6, ARRAY['reference'], 'send_reference', NULL),
  (7, ARRAY['enter mm pin'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='bill_payment' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);

-- ============================================================
-- Pay to Merchant (merchant_payment)
-- ============================================================
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'merchant_payment', '*171#',
  ARRAY['paid to'],
  ARRAY['failed', 'insufficient', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='merchant_payment' AND company_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '1'),
  (2, ARRAY['pay to', '2) merchant'], 'send_digit', '2'),
  (3, ARRAY['merchant id'], 'send_merchant_id', NULL),
  (4, ARRAY['enter amount'], 'send_amount', NULL),
  (5, ARRAY['reference'], 'send_reference', NULL),
  (6, ARRAY['enter mm pin'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='merchant_payment' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);
