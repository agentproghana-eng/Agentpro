-- Telecel Agent Business Deposit.
--
-- *110#
-- 2 Agent Transactions
-- 3 Business Deposit
-- 2 Agent Short Code
-- Enter Agent Short Code
-- Enter Amount
-- Enter Operator ID
-- Stop at PIN.

INSERT INTO ussd_flows (
  provider,
  transaction_type,
  dial_code,
  success_markers,
  failure_markers,
  created_by
)
SELECT
  'telecel',
  'business_deposit',
  '*110#',
  ARRAY['successful', 'confirmed', 'deposited'],
  ARRAY['failed', 'invalid', 'insufficient', 'cancelled', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE EXISTS (
  SELECT 1 FROM users WHERE role = 'superuser'
)
AND NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'business_deposit'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = true
);

INSERT INTO ussd_flow_steps (
  flow_id,
  step_order,
  match_all,
  action,
  action_value
)
SELECT
  f.id,
  s.step_order,
  s.match_all,
  s.action::ussd_flow_action,
  s.action_value
FROM ussd_flows f,
(VALUES
  (1, ARRAY['2 agent transactions'], 'send_digit', '2'),
  (2, ARRAY['3 business deposit'], 'send_digit', '3'),
  (3, ARRAY['2 agent short code'], 'send_digit', '2'),
  (4, ARRAY['enter agent short code'], 'send_customer_phone', NULL),
  (5, ARRAY['enter amount'], 'send_amount', NULL),
  (6, ARRAY['enter operator id'], 'send_operator_id', NULL),
  (7, ARRAY['enter pin'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider = 'telecel'
  AND f.transaction_type = 'business_deposit'
  AND f.company_id IS NULL
  AND f.owner_user_id IS NULL
  AND f.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps
    WHERE flow_id = f.id
  );
