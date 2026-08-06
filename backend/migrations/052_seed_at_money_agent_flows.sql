-- AT Money Agent SIM flows mapped from confirmed *110# instructions.
-- Automation stops completely at the PIN prompt.
--
-- Confirm these screen-text match markers against a live AT Money
-- Agent SIM before enabling for production use.

ALTER TYPE transaction_type
  ADD VALUE IF NOT EXISTS 'cash_out_commission';

-- ============================================================
-- 1. Deposit
-- *110# -> 1 Agent Transaction -> 1 Deposit
-- phone -> amount -> PIN
-- ============================================================

INSERT INTO ussd_flows (
  provider,
  transaction_type,
  dial_code,
  success_markers,
  failure_markers,
  created_by
)
SELECT
  'at_money',
  'cash_in',
  '*110#',
  ARRAY['successful', 'confirmed', 'deposit'],
  ARRAY['failed', 'insufficient', 'invalid', 'error', 'cancelled'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider = 'at_money'
    AND transaction_type = 'cash_in'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = true
)
AND EXISTS (
  SELECT 1 FROM users WHERE role = 'superuser'
);

INSERT INTO ussd_flow_steps (
  flow_id,
  step_order,
  match_all,
  action,
  action_value
)
SELECT
  flow.id,
  step.step_order,
  step.match_all,
  step.action::ussd_flow_action,
  step.action_value
FROM ussd_flows flow,
(VALUES
  (1, ARRAY['agent transaction'], 'send_digit', '1'),
  (2, ARRAY['deposit'], 'send_digit', '1'),
  (3, ARRAY['phone number'], 'send_customer_phone', NULL),
  (4, ARRAY['amount'], 'send_amount', NULL),
  (5, ARRAY['pin'], 'pin_prompt', NULL)
) AS step(step_order, match_all, action, action_value)
WHERE flow.provider = 'at_money'
  AND flow.transaction_type = 'cash_in'
  AND flow.company_id IS NULL
  AND flow.owner_user_id IS NULL
  AND flow.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps
    WHERE flow_id = flow.id
  );

-- ============================================================
-- 2. Normal Wallet Balance
-- *110# -> 6 -> 1 -> 1 -> PIN
-- ============================================================

INSERT INTO ussd_flows (
  provider,
  transaction_type,
  dial_code,
  success_markers,
  failure_markers,
  created_by
)
SELECT
  'at_money',
  'balance_enquiry',
  '*110#',
  ARRAY['balance', 'available balance', 'wallet balance'],
  ARRAY['failed', 'invalid', 'error', 'cancelled'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider = 'at_money'
    AND transaction_type = 'balance_enquiry'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = true
)
AND EXISTS (
  SELECT 1 FROM users WHERE role = 'superuser'
);

INSERT INTO ussd_flow_steps (
  flow_id,
  step_order,
  match_all,
  action,
  action_value
)
SELECT
  flow.id,
  step.step_order,
  step.match_all,
  step.action::ussd_flow_action,
  step.action_value
FROM ussd_flows flow,
(VALUES
  (1, ARRAY['6'], 'send_digit', '6'),
  (2, ARRAY['1'], 'send_digit', '1'),
  (3, ARRAY['1'], 'send_digit', '1'),
  (4, ARRAY['pin'], 'pin_prompt', NULL)
) AS step(step_order, match_all, action, action_value)
WHERE flow.provider = 'at_money'
  AND flow.transaction_type = 'balance_enquiry'
  AND flow.company_id IS NULL
  AND flow.owner_user_id IS NULL
  AND flow.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps
    WHERE flow_id = flow.id
  );

-- ============================================================
-- 3. Cash-In Commission Balance
-- *110# -> 6 -> 6 -> 1 -> PIN
-- ============================================================

INSERT INTO ussd_flows (
  provider,
  transaction_type,
  dial_code,
  success_markers,
  failure_markers,
  created_by
)
SELECT
  'at_money',
  'cash_in_commission',
  '*110#',
  ARRAY['commission balance', 'cash in commission', 'balance'],
  ARRAY['failed', 'invalid', 'error', 'cancelled'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider = 'at_money'
    AND transaction_type = 'cash_in_commission'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = true
)
AND EXISTS (
  SELECT 1 FROM users WHERE role = 'superuser'
);

INSERT INTO ussd_flow_steps (
  flow_id,
  step_order,
  match_all,
  action,
  action_value
)
SELECT
  flow.id,
  step.step_order,
  step.match_all,
  step.action::ussd_flow_action,
  step.action_value
FROM ussd_flows flow,
(VALUES
  (1, ARRAY['6'], 'send_digit', '6'),
  (2, ARRAY['6'], 'send_digit', '6'),
  (3, ARRAY['1'], 'send_digit', '1'),
  (4, ARRAY['pin'], 'pin_prompt', NULL)
) AS step(step_order, match_all, action, action_value)
WHERE flow.provider = 'at_money'
  AND flow.transaction_type = 'cash_in_commission'
  AND flow.company_id IS NULL
  AND flow.owner_user_id IS NULL
  AND flow.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps
    WHERE flow_id = flow.id
  );

-- ============================================================
-- 4. Cash-Out Commission Balance
-- *110# -> 6 -> 1 -> 2 -> PIN
-- ============================================================

INSERT INTO ussd_flows (
  provider,
  transaction_type,
  dial_code,
  success_markers,
  failure_markers,
  created_by
)
SELECT
  'at_money',
  'cash_out_commission',
  '*110#',
  ARRAY['commission balance', 'cash out commission', 'balance'],
  ARRAY['failed', 'invalid', 'error', 'cancelled'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider = 'at_money'
    AND transaction_type = 'cash_out_commission'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = true
)
AND EXISTS (
  SELECT 1 FROM users WHERE role = 'superuser'
);

INSERT INTO ussd_flow_steps (
  flow_id,
  step_order,
  match_all,
  action,
  action_value
)
SELECT
  flow.id,
  step.step_order,
  step.match_all,
  step.action::ussd_flow_action,
  step.action_value
FROM ussd_flows flow,
(VALUES
  (1, ARRAY['6'], 'send_digit', '6'),
  (2, ARRAY['1'], 'send_digit', '1'),
  (3, ARRAY['2'], 'send_digit', '2'),
  (4, ARRAY['pin'], 'pin_prompt', NULL)
) AS step(step_order, match_all, action, action_value)
WHERE flow.provider = 'at_money'
  AND flow.transaction_type = 'cash_out_commission'
  AND flow.company_id IS NULL
  AND flow.owner_user_id IS NULL
  AND flow.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps
    WHERE flow_id = flow.id
  );

-- ============================================================
-- 5. Agent to Agent
-- *110# -> 1 -> 4 -> 1
-- phone -> amount -> 1 confirm -> PIN
-- ============================================================

INSERT INTO ussd_flows (
  provider,
  transaction_type,
  dial_code,
  success_markers,
  failure_markers,
  created_by
)
SELECT
  'at_money',
  'send_money',
  '*110#',
  ARRAY['successful', 'confirmed', 'transferred'],
  ARRAY['failed', 'insufficient', 'invalid', 'error', 'cancelled'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider = 'at_money'
    AND transaction_type = 'send_money'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = true
)
AND EXISTS (
  SELECT 1 FROM users WHERE role = 'superuser'
);

INSERT INTO ussd_flow_steps (
  flow_id,
  step_order,
  match_all,
  action,
  action_value
)
SELECT
  flow.id,
  step.step_order,
  step.match_all,
  step.action::ussd_flow_action,
  step.action_value
FROM ussd_flows flow,
(VALUES
  (1, ARRAY['agent transaction'], 'send_digit', '1'),
  (2, ARRAY['agent to agent'], 'send_digit', '4'),
  (3, ARRAY['1'], 'send_digit', '1'),
  (4, ARRAY['phone number'], 'send_customer_phone', NULL),
  (5, ARRAY['amount'], 'send_amount', NULL),
  (6, ARRAY['confirm'], 'send_digit', '1'),
  (7, ARRAY['pin'], 'pin_prompt', NULL)
) AS step(step_order, match_all, action, action_value)
WHERE flow.provider = 'at_money'
  AND flow.transaction_type = 'send_money'
  AND flow.company_id IS NULL
  AND flow.owner_user_id IS NULL
  AND flow.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps
    WHERE flow_id = flow.id
  );
