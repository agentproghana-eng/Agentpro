-- Telecel Agent Balance Enquiry
-- *110# → 7 My Account → 1 Show Balance
-- Auto-enter Operator ID, then stop at PIN.

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
  'balance_enquiry',
  '*110#',
  ARRAY['balance','available balance'],
  ARRAY['failed','error','invalid'],
  (SELECT id FROM users WHERE role='superuser' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider='telecel'
    AND transaction_type='balance_enquiry'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active=true
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
(
VALUES
(1, ARRAY['7 my account'], 'send_digit', '7'),
(2, ARRAY['1 show balance'], 'send_digit', '1'),
(3, ARRAY['enter operator id'], 'send_operator_id', NULL),
(4, ARRAY['enter pin'], 'pin_prompt', NULL)
) s(step_order,match_all,action,action_value)
WHERE f.provider='telecel'
AND f.transaction_type='balance_enquiry'
AND f.company_id IS NULL
AND f.owner_user_id IS NULL
AND NOT EXISTS (
  SELECT 1
  FROM ussd_flow_steps
  WHERE flow_id=f.id
);
