-- MTN Personal Send Money (Same Network)
--
-- Confirmed on a live MTN Personal MoMo SIM using *170#:
--
--   *170#
--   1) Transfer Money
--   Enter mobile number
--   Confirm Number              -> same recipient number again
--   Enter Amount
--   Enter Reference
--   Enter MM PIN                -> automation stops for manual PIN entry
--
-- After PIN, MTN may show an optional MoMo Boost offer when funds are
-- insufficient. This flow deliberately has NO auto_confirm_once step:
-- AgentPro must never approve that financial decision automatically.
--
-- The only seeded success marker is wording observed on the successful
-- receipt screen. Failure markers remain empty until a real failure
-- screen has been verified on-device.

INSERT INTO ussd_flows (
  provider,
  transaction_type,
  dial_code,
  success_markers,
  failure_markers,
  created_by
)
SELECT
  'mtn',
  'send_money_same_network',
  '*170#',
  ARRAY['you have sent ghs'],
  ARRAY[]::TEXT[],
  (
    SELECT id
    FROM users
    WHERE role = 'superuser'
    LIMIT 1
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider = 'mtn'
    AND transaction_type = 'send_money_same_network'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE
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
(
  VALUES
    (1, ARRAY['transfer money'],       'send_digit',          '1'),
    (2, ARRAY['enter mobile number'], 'send_customer_phone', NULL),
    (3, ARRAY['confirm number'],      'send_customer_phone', NULL),
    (4, ARRAY['enter amount'],        'send_amount',         NULL),
    (5, ARRAY['enter reference'],     'send_reference',      NULL),
    (6, ARRAY['enter mm pin'],        'pin_prompt',          NULL)
) s(step_order, match_all, action, action_value)
WHERE f.provider = 'mtn'
  AND f.transaction_type = 'send_money_same_network'
  AND f.company_id IS NULL
  AND f.owner_user_id IS NULL
  AND COALESCE(f.bundle_category, '') = ''
  AND COALESCE(f.recipient_mode, '') = ''
  AND f.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps
    WHERE flow_id = f.id
  );
