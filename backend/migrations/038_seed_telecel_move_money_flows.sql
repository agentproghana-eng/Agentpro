-- Telecel Agent Move Money flows.
--
-- Common sequence:
--   *110#
--   2 Agent Transactions
--   2 Move Money
--   1 From Working Account / 2 From Float / 3 From Commission
--   Enter Amount
--   Enter 1 to confirm
--   Enter Operator ID
--   Stop at PIN so the user authorizes manually.

ALTER TYPE transaction_type
  ADD VALUE IF NOT EXISTS 'working_to_float';

ALTER TYPE transaction_type
  ADD VALUE IF NOT EXISTS 'float_to_working';

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
  v.transaction_type::transaction_type,
  '*110#',
  ARRAY['successful', 'confirmed', 'transferred'],
  ARRAY['failed', 'insufficient', 'invalid', 'error', 'cancelled'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
FROM (
  VALUES
    ('working_to_float'),
    ('float_to_working'),
    ('commission_transfer')
) AS v(transaction_type)
WHERE EXISTS (
  SELECT 1 FROM users WHERE role = 'superuser'
)
AND NOT EXISTS (
  SELECT 1
  FROM ussd_flows f
  WHERE f.provider = 'telecel'
    AND f.transaction_type = v.transaction_type::transaction_type
    AND f.company_id IS NULL
    AND f.owner_user_id IS NULL
    AND f.is_active = true
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
FROM ussd_flows f
JOIN (
  VALUES
    ('working_to_float', 1, ARRAY['2 agent transactions'], 'send_digit', '2'),
    ('working_to_float', 2, ARRAY['2 move money'], 'send_digit', '2'),
    ('working_to_float', 3, ARRAY['1 from working account'], 'send_digit', '1'),
    ('working_to_float', 4, ARRAY['enter amount'], 'send_amount', NULL),
    ('working_to_float', 5, ARRAY['enter 1 to confirm'], 'send_digit', '1'),
    ('working_to_float', 6, ARRAY['enter operator id'], 'send_operator_id', NULL),
    ('working_to_float', 7, ARRAY['enter pin'], 'pin_prompt', NULL),

    ('float_to_working', 1, ARRAY['2 agent transactions'], 'send_digit', '2'),
    ('float_to_working', 2, ARRAY['2 move money'], 'send_digit', '2'),
    ('float_to_working', 3, ARRAY['2 from float'], 'send_digit', '2'),
    ('float_to_working', 4, ARRAY['enter amount'], 'send_amount', NULL),
    ('float_to_working', 5, ARRAY['enter 1 to confirm'], 'send_digit', '1'),
    ('float_to_working', 6, ARRAY['enter operator id'], 'send_operator_id', NULL),
    ('float_to_working', 7, ARRAY['enter pin'], 'pin_prompt', NULL),

    ('commission_transfer', 1, ARRAY['2 agent transactions'], 'send_digit', '2'),
    ('commission_transfer', 2, ARRAY['2 move money'], 'send_digit', '2'),
    ('commission_transfer', 3, ARRAY['3 from commission'], 'send_digit', '3'),
    ('commission_transfer', 4, ARRAY['enter amount'], 'send_amount', NULL),
    ('commission_transfer', 5, ARRAY['enter 1 to confirm'], 'send_digit', '1'),
    ('commission_transfer', 6, ARRAY['enter operator id'], 'send_operator_id', NULL),
    ('commission_transfer', 7, ARRAY['enter pin'], 'pin_prompt', NULL)
) AS s(transaction_type, step_order, match_all, action, action_value)
  ON f.transaction_type = s.transaction_type::transaction_type
WHERE f.provider = 'telecel'
  AND f.company_id IS NULL
  AND f.owner_user_id IS NULL
  AND f.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps existing
    WHERE existing.flow_id = f.id
  );
