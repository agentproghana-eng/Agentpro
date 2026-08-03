-- Telecel Agent Data Bundle flow.
-- User manually confirms and enters PIN.

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
  'data_bundle',
  '*110#',
  ARRAY['successful', 'confirmed', 'bundle'],
  ARRAY['failed', 'insufficient', 'invalid', 'error', 'cancelled'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'data_bundle'
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
  f.id,
  s.step_order,
  s.match_all,
  s.action::ussd_flow_action,
  s.action_value
FROM ussd_flows f,
(VALUES
  (1, ARRAY['3 airtime or data sales'], 'send_digit', '3'),
  (2, ARRAY['1 airtime sales', '2 buy bundle'], 'send_digit', '2'),
  (3, ARRAY['1gb, 200mins allnet', '1.5gb for ghs5'], 'send_selection', NULL),
  (4, ARRAY['enter operator id'], 'send_operator_id', NULL),
  (5, ARRAY['you have requested to purchase', '1. confirm', '0. cancel'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider = 'telecel'
  AND f.transaction_type = 'data_bundle'
  AND f.company_id IS NULL
  AND f.owner_user_id IS NULL
  AND f.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps
    WHERE flow_id = f.id
  );
