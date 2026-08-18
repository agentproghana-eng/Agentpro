-- MTN Ghana Personal balance flows.
--
-- Verified live on a Personal MTN SIM in August 2026.
--
-- MoMo wallet balance:
--   *170#
--   -> 6
--   -> 1) Check Balance
--   -> "Fee is GHS 0.00. Enter MM PIN"
--   -> STOP for manual PIN entry
--   -> "Current Balance: GHS ..., Available Balance: GHS ..."
--
-- Pulse balance:
--   *567#
--   -> 1) Proceed to buy bundle
--   -> 99) More
--   -> 7) Check Balance
--   -> "Y'ello! Your Pulse balance ..."
--
-- AgentPro never stores, prefills, logs or submits the user's MoMo PIN.

-- ============================================================
-- MTN PERSONAL MOMO WALLET BALANCE
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
  'mtn',
  'check_momo_balance',
  '*170#',
  ARRAY[
    'current balance',
    'available balance'
  ],
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
    AND transaction_type = 'check_momo_balance'
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
    (
      1,
      ARRAY[
        'transfer money',
        'momopay&pay bill',
        'airtime&bundles',
        'allow cash out'
      ],
      'send_digit',
      '6'
    ),
    (
      2,
      ARRAY[
        'check balance',
        'my approvals',
        'statements'
      ],
      'send_digit',
      '1'
    ),
    (
      3,
      ARRAY[
        'fee is ghs',
        'enter mm pin'
      ],
      'pin_prompt',
      NULL
    )
) AS s(step_order, match_all, action, action_value)
WHERE f.provider = 'mtn'
  AND f.transaction_type = 'check_momo_balance'
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


-- ============================================================
-- MTN PERSONAL PULSE BALANCE
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
  'mtn',
  'check_airtime_balance',
  '*567#',
  ARRAY[
    'your pulse balance'
  ],
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
    AND transaction_type = 'check_airtime_balance'
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
    (
      1,
      ARRAY[
        'welcome to mtn pulse',
        'proceed to buy bundle',
        '99. more'
      ],
      'send_digit',
      '1'
    ),
    (
      2,
      ARRAY[
        'mashup for self',
        'mashup for others',
        '99. more'
      ],
      'send_digit',
      '99'
    ),
    (
      3,
      ARRAY[
        'download app',
        'check balance'
      ],
      'send_digit',
      '7'
    )
) AS s(step_order, match_all, action, action_value)
WHERE f.provider = 'mtn'
  AND f.transaction_type = 'check_airtime_balance'
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
