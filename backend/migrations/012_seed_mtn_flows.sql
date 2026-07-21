-- Seeds five global (superuser-owned) MTN USSD flows, all confirmed
-- via live device mapping tonight: Airtime, Data Bundle, Check
-- Commission Balance, View Cash In Commission, and Transfer
-- Commission to Wallet. Each is inserted with its steps in the exact
-- order confirmed on-device. Uses a subquery to link steps to their
-- flow's id, relying on the existing unique index on
-- (provider, transaction_type) for global flows.

-- ============================================================
-- 1. Airtime
-- ============================================================
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'airtime', '*171#',
  ARRAY['airtime payment made', 'successful'],
  ARRAY['failed', 'insufficient', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='airtime' AND company_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '5'),
  (2, ARRAY['airtime&bundles', '1) sell airtime'], 'send_digit', '1'),
  (3, ARRAY['enter mobile number'], 'send_customer_phone', NULL),
  (4, ARRAY['repeat mobile number'], 'send_customer_phone', NULL),
  (5, ARRAY['select amount'], 'send_digit', '5'),
  (6, ARRAY['enter amount'], 'send_amount', NULL),
  (7, ARRAY['enter mm pin'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='airtime' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);

-- ============================================================
-- 2. Data Bundle
-- ============================================================
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'data_bundle', '*171#',
  ARRAY['has been made successfully'],
  ARRAY['failed', 'insufficient', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='data_bundle' AND company_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '5'),
  (2, ARRAY['airtime&bundles'], 'send_digit', '2'),
  (3, ARRAY['welcome to bundle portal'], 'send_digit', '1'),
  (4, ARRAY['buy for self', 'buy for others'], 'send_digit', '2'),
  (5, ARRAY['enter phone number'], 'send_customer_phone', NULL),
  (6, ARRAY['repeat', 'phone number'], 'send_customer_phone', NULL),
  (7, ARRAY['select data bundle', 'flexi bundles'], 'send_digit', '1'),
  (8, ARRAY['enter amount to buy preferred bundle'], 'send_amount', NULL),
  (9, ARRAY['this bundle does not expire'], 'send_digit', '1'),
  (10, ARRAY['choose payment mode', 'mobile money'], 'send_digit', '2'),
  (11, ARRAY['authorize payment', 'enter mm pin to continue'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='data_bundle' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);

-- ============================================================
-- 3. Check Commission Balance
-- ============================================================
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'commission_balance', '*171#',
  ARRAY['current commission balance'],
  ARRAY['failed', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='commission_balance' AND company_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '7'),
  (2, ARRAY['my wallet', '1) check balance'], 'send_digit', '2'),
  (3, ARRAY['commissions', '1) check commission balance'], 'send_digit', '1'),
  (4, ARRAY['enter mm pin'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='commission_balance' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);

-- ============================================================
-- 4. View Cash In Commission
-- ============================================================
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'cash_in_commission', '*171#',
  ARRAY['transaction summary will be sent'],
  ARRAY['failed', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='cash_in_commission' AND company_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '7'),
  (2, ARRAY['my wallet', '1) check balance'], 'send_digit', '2'),
  (3, ARRAY['commissions', '1) check commission balance'], 'send_digit', '3'),
  (4, ARRAY['enter mm pin'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='cash_in_commission' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);

-- ============================================================
-- 5. Transfer Commission to Wallet
-- ============================================================
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'commission_transfer', '*171#',
  ARRAY['transfer of amount', 'was successful'],
  ARRAY['failed', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='commission_transfer' AND company_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '7'),
  (2, ARRAY['my wallet', '1) check balance'], 'send_digit', '2'),
  (3, ARRAY['commissions', '1) check commission balance'], 'send_digit', '2'),
  (4, ARRAY['enter amount to transfer'], 'send_amount', NULL),
  (5, ARRAY['from commissions to wallet'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='commission_transfer' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);
