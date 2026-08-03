-- Seeds the Telecel Agent Cash In (Deposit) USSD flow from a live-device
-- walkthrough captured on 2026-08-03.
--
-- Confirmed sequence:
--   *110#
--   1 Deposit
--   Enter phone no
--   Enter amount
--   Enter Operator ID
--   Transaction Information ... Press 1 to confirm or 0 to cancel
--
-- Automation intentionally stops at the confirmation screen. The user must
-- manually press 1 to confirm and then enter the sensitive PIN.

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
  'cash_in',
  '*110#',
  ARRAY['confirmed', 'you made a deposit'],
  ARRAY['failed', 'insufficient', 'invalid', 'error', 'cancelled'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'cash_in'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = true
)
AND EXISTS (
  SELECT 1
  FROM users
  WHERE role = 'superuser'
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
  (1, ARRAY['1 deposit', '2 agent transactions'], 'send_digit', '1'),
  (2, ARRAY['enter phone no'], 'send_customer_phone', NULL),
  (3, ARRAY['enter amount'], 'send_amount', NULL),
  (4, ARRAY['enter operator id'], 'send_operator_id', NULL),
  (5, ARRAY['transaction information', 'press 1 to confirm', '0 to cancel'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider = 'telecel'
  AND f.transaction_type = 'cash_in'
  AND f.company_id IS NULL
  AND f.owner_user_id IS NULL
  AND f.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps
    WHERE flow_id = f.id
  );
