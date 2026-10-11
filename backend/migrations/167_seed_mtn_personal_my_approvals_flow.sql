-- MTN Ghana Personal "My Approvals".
--
-- Verified live on a Personal MTN SIM in October 2026:
--   *170#
--   -> 6 (second menu)
--   -> 3) My Approvals
--   -> "My Approvals  1) My Approvals  2) PreApprovals  0) Back"
--   -> 1
--   -> "Enter PIN to get your Pending Approval list:"
--   -> STOP for manual PIN entry
--   -> the subscriber continues on the phone; with nothing pending the
--      network replies "You have no Pending Approvals".
--
-- AgentPro never stores, prefills, logs or submits the user's MoMo PIN.
--
-- 'pending approval' is deliberately NOT a success marker: it appears on
-- the PIN screen itself and would report success before the PIN.

INSERT INTO ussd_flow_capabilities (
  transaction_type,
  account_mode,
  display_label,
  can_initiate
)
VALUES
  ('my_approvals', 'personal', 'My Approvals', TRUE)
ON CONFLICT (transaction_type, account_mode) DO UPDATE
SET
  display_label = EXCLUDED.display_label,
  is_active = TRUE,
  can_initiate = EXCLUDED.can_initiate,
  updated_at = NOW();

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
  'my_approvals',
  '*170#',
  ARRAY[
    'no pending approvals'
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
    AND transaction_type = 'my_approvals'
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
      '3'
    ),
    (
      3,
      ARRAY[
        'my approvals',
        'preapprovals'
      ],
      'send_digit',
      '1'
    ),
    (
      4,
      ARRAY[
        'enter pin',
        'pending approval'
      ],
      'pin_prompt',
      NULL
    )
) AS s(step_order, match_all, action, action_value)
WHERE f.provider = 'mtn'
  AND f.transaction_type = 'my_approvals'
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
