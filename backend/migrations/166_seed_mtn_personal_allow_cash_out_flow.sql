-- MTN Ghana Personal "Allow Cash Out".
--
-- Verified live on a Personal MTN SIM in October 2026:
--   *170#
--   -> 4) Allow Cash Out
--   -> "Allow Cash Out  1) Yes  2) No  0) Back"
--   -> 1
--   -> "MTN GH Message: Cash out is Allowed"
--
-- No PIN, amount, phone number or reference is involved. It is a
-- centrally managed, PIN-less Global flow (trusted explicitly in the
-- backend and app PIN-less allowlists).

INSERT INTO ussd_flow_capabilities (
  transaction_type,
  account_mode,
  display_label,
  can_initiate
)
VALUES
  ('allow_cash_out', 'personal', 'Allow Cash Out', TRUE)
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
  'allow_cash_out',
  '*170#',
  ARRAY[
    'cash out is allowed'
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
    AND transaction_type = 'allow_cash_out'
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
      '4'
    ),
    (
      2,
      ARRAY[
        'allow cash out',
        '1) yes',
        '2) no'
      ],
      'send_digit',
      '1'
    )
) AS s(step_order, match_all, action, action_value)
WHERE f.provider = 'mtn'
  AND f.transaction_type = 'allow_cash_out'
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
