-- Repair Telecel Global Business USSD flows that were silently skipped
-- during initial database bootstrap.
--
-- Historical Telecel seed migrations depended on a superuser already
-- existing. On the original AgentPro database those migrations ran
-- immediately before the first superuser was created, so PostgreSQL
-- successfully completed the migrations while inserting zero flows.
--
-- This migration deliberately replays the already-reviewed historical
-- Telecel flow definitions. It is idempotent: every historical seed
-- only inserts when the corresponding active Global flow is absent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    WHERE role = 'superuser'
  ) THEN
    RAISE EXCEPTION
      'Cannot repair Telecel Global flows: no superuser exists';
  END IF;
END
$$;


-- ============================================================
-- Replayed from: backend/migrations/018_seed_telecel_airtime_flow.sql
-- ============================================================
-- Seeds the Telecel Airtime USSD flow, mapped step-by-step from live
-- device screenshots (dial *110# through PIN prompt). Telecel had no
-- Flow Builder entries at all before this - every prior seed
-- migration (012, 015) is MTN-only.
--
-- IMPORTANT: success_markers/failure_markers below are NOT confirmed
-- against a real completed transaction - the source screenshots only
-- went as far as the PIN prompt, never an actual success or failure
-- result screen. They're set to broad, generic terms as a reasonable
-- starting point, but must be verified (and corrected if needed)
-- against a real live test before this can be trusted not to hang
-- the same way the original MTN Cash In marker-mismatch bug did.
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'telecel', 'airtime', '*110#',
  ARRAY['successful', 'received'],
  ARRAY['failed', 'insufficient', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='telecel' AND transaction_type='airtime' AND company_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['3 airtime or data sales'], 'send_digit', '3'),
  (2, ARRAY['1 airtime sales'], 'send_digit', '1'),
  (3, ARRAY['enter phone number'], 'send_customer_phone', NULL),
  (4, ARRAY['re-enter phone number'], 'send_customer_phone', NULL),
  (5, ARRAY['enter amount'], 'send_amount', NULL),
  (6, ARRAY['enter operator id'], 'send_operator_id', NULL),
  (7, ARRAY['enter pin to confirm'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='telecel' AND f.transaction_type='airtime' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);

-- ============================================================
-- Replayed from: backend/migrations/035_seed_telecel_cash_in_flow.sql
-- ============================================================
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

-- ============================================================
-- Replayed from: backend/migrations/036_seed_telecel_agent_data_bundle_flow.sql
-- ============================================================
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

-- ============================================================
-- Replayed from: backend/migrations/037_seed_telecel_balance_enquiry_flow.sql
-- ============================================================
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

-- ============================================================
-- Replayed from: backend/migrations/039_seed_telecel_move_money_flows.sql
-- ============================================================
-- Telecel Agent Move Money flows.
-- Enum values are added separately by migration 038 so PostgreSQL
-- commits them before they are used here.

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

-- ============================================================
-- Replayed from: backend/migrations/041_seed_telecel_business_deposit_flow.sql
-- ============================================================
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

-- ============================================================
-- Replayed from: backend/migrations/044_seed_telecel_business_withdrawal_flow.sql
-- ============================================================
-- Telecel Agent Business Withdrawal.
--
-- *110#
-- 2 Agent Transactions
-- 4 Business Withdrawal
-- 2 Agent Short Code
-- Enter Agent Short Code
-- Enter Amount
-- Enter Operator ID
-- Stop at PIN for manual authorization.

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
  'business_withdrawal',
  '*110#',
  ARRAY['successful', 'confirmed', 'withdrawal'],
  ARRAY['failed', 'invalid', 'insufficient', 'cancelled', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE EXISTS (
  SELECT 1 FROM users WHERE role = 'superuser'
)
AND NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'business_withdrawal'
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
  (2, ARRAY['4 business withdrawal'], 'send_digit', '4'),
  (3, ARRAY['2 agent short code'], 'send_digit', '2'),
  (4, ARRAY['enter agent short code'], 'send_customer_phone', NULL),
  (5, ARRAY['enter amount'], 'send_amount', NULL),
  (6, ARRAY['enter operator id'], 'send_operator_id', NULL),
  (7, ARRAY['enter pin'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider = 'telecel'
  AND f.transaction_type = 'business_withdrawal'
  AND f.company_id IS NULL
  AND f.owner_user_id IS NULL
  AND f.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps
    WHERE flow_id = f.id
  );

-- ============================================================
-- Repair validation
-- ============================================================

DO $$
DECLARE
  missing_types TEXT;
  bad_steps TEXT;
BEGIN
  SELECT string_agg(expected.transaction_type, ', ' ORDER BY expected.transaction_type)
  INTO missing_types
  FROM (
    VALUES
      ('airtime'),
      ('cash_in'),
      ('data_bundle'),
      ('balance_enquiry'),
      ('working_to_float'),
      ('float_to_working'),
      ('commission_transfer'),
      ('business_deposit'),
      ('business_withdrawal')
  ) AS expected(transaction_type)
  WHERE NOT EXISTS (
    SELECT 1
    FROM ussd_flows f
    WHERE f.provider = 'telecel'
      AND f.transaction_type::text = expected.transaction_type
      AND f.company_id IS NULL
      AND f.owner_user_id IS NULL
      AND f.is_active = TRUE
  );

  IF missing_types IS NOT NULL THEN
    RAISE EXCEPTION
      'Telecel repair incomplete; missing Global flows: %',
      missing_types;
  END IF;

  SELECT string_agg(
    f.transaction_type::text || '=' || counts.step_count::text,
    ', '
    ORDER BY f.transaction_type::text
  )
  INTO bad_steps
  FROM ussd_flows f
  CROSS JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS step_count
    FROM ussd_flow_steps s
    WHERE s.flow_id = f.id
  ) counts
  WHERE f.provider = 'telecel'
    AND f.company_id IS NULL
    AND f.owner_user_id IS NULL
    AND f.is_active = TRUE
    AND (
      (f.transaction_type::text = 'airtime'             AND counts.step_count <> 7) OR
      (f.transaction_type::text = 'cash_in'             AND counts.step_count <> 5) OR
      (f.transaction_type::text = 'data_bundle'         AND counts.step_count <> 5) OR
      (f.transaction_type::text = 'balance_enquiry'     AND counts.step_count <> 4) OR
      (f.transaction_type::text = 'working_to_float'    AND counts.step_count <> 7) OR
      (f.transaction_type::text = 'float_to_working'    AND counts.step_count <> 7) OR
      (f.transaction_type::text = 'commission_transfer' AND counts.step_count <> 7) OR
      (f.transaction_type::text = 'business_deposit'    AND counts.step_count <> 7) OR
      (f.transaction_type::text = 'business_withdrawal' AND counts.step_count <> 7)
    );

  IF bad_steps IS NOT NULL THEN
    RAISE EXCEPTION
      'Telecel repair produced unexpected step counts: %',
      bad_steps;
  END IF;
END
$$;
