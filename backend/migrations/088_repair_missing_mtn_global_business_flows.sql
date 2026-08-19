-- Repair missing MTN Global Business USSD flows.
--
-- Historical MTN seed migrations ran during initial bootstrap and depended
-- on a superuser already existing. Like the Telecel repair in migration 083,
-- a migration can therefore be recorded successfully while INSERT ... SELECT
-- inserts zero rows.
--
-- This repair deliberately exposes only flows with live-device evidence:
--
--   * MTN Cash In:
--       represented canonically by transaction_type = send_money.
--       Flutter maps this to the proven hardcoded MTN Cash In Accessibility
--       path before any generic Flow Builder execution.
--
--   * MTN Cash Out:
--       proven hardcoded Accessibility path.
--
--   * Airtime, Data Bundle, Commission Balance,
--     Cash In Commission, Commission Transfer:
--       replayed from migration 012, whose source states they were confirmed
--       through live device mapping.
--
--   * Balance Enquiry:
--       replayed from migration 020, whose interactive path was live-mapped.
--
-- Pay to Agent (bill_payment) and Merchant Payment are intentionally NOT
-- repaired here. Migration 015 describes those mappings as best-effort
-- reconstructions rather than fresh live-device validation.
--
-- AT Money remains intentionally excluded. Migration 053 is a deliberate
-- no-op until live AT Money Agent screen text has been validated.
--
-- Every INSERT is idempotent and targets only true-Global rows:
-- company_id IS NULL AND owner_user_id IS NULL.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    WHERE role = 'superuser'
  ) THEN
    RAISE EXCEPTION
      'Cannot repair MTN Global Business flows: no superuser exists';
  END IF;
END
$$;


-- ============================================================
-- MTN Cash In
-- Canonical Business transaction type: send_money
--
-- Proven native path:
--   *171#
--   MainMenuAgent -> 3 Cash In
--   1 Mobile Money User
--   phone
--   repeat phone
--   amount
--   PIN prompt -> STOP
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
  'send_money',
  '*171#',
  ARRAY[
    'cash in successful',
    'receive cash in',
    'transaction successful'
  ],
  ARRAY[
    'failed',
    'insufficient',
    'not found',
    'error'
  ],
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
    AND transaction_type = 'send_money'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = TRUE
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
      ARRAY['mainmenuagent', '3) cash in'],
      'send_digit',
      '3'
    ),
    (
      2,
      ARRAY['cash in', '1) mobile money user'],
      'send_digit',
      '1'
    ),
    (
      3,
      ARRAY['enter mobile number'],
      'send_customer_phone',
      NULL
    ),
    (
      4,
      ARRAY['repeat mobile number'],
      'send_customer_phone',
      NULL
    ),
    (
      5,
      ARRAY['enter amount'],
      'send_amount',
      NULL
    ),
    (
      6,
      ARRAY['enter mm pin'],
      'pin_prompt',
      NULL
    )
) AS s(
  step_order,
  match_all,
  action,
  action_value
)
WHERE f.provider = 'mtn'
  AND f.transaction_type = 'send_money'
  AND f.company_id IS NULL
  AND f.owner_user_id IS NULL
  AND f.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps existing
    WHERE existing.flow_id = f.id
  );


-- ============================================================
-- MTN Cash Out
--
-- Proven native path:
--   *171#
--   MainMenuAgent -> 2 Cash Out
--   1 Mobile Money User
--   phone
--   repeat phone
--   amount
--   PIN prompt -> STOP
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
  'cash_out',
  '*171#',
  ARRAY[
    'transaction successful'
  ],
  ARRAY[
    'failed',
    'insufficient',
    'not found',
    'error'
  ],
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
    AND transaction_type = 'cash_out'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = TRUE
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
      ARRAY['mainmenuagent', '2) cash out'],
      'send_digit',
      '2'
    ),
    (
      2,
      ARRAY['cash out', '1) mobile money user'],
      'send_digit',
      '1'
    ),
    (
      3,
      ARRAY['enter mobile number'],
      'send_customer_phone',
      NULL
    ),
    (
      4,
      ARRAY['repeat mobile number'],
      'send_customer_phone',
      NULL
    ),
    (
      5,
      ARRAY['enter amount'],
      'send_amount',
      NULL
    ),
    (
      6,
      ARRAY['enter mm pin'],
      'pin_prompt',
      NULL
    )
) AS s(
  step_order,
  match_all,
  action,
  action_value
)
WHERE f.provider = 'mtn'
  AND f.transaction_type = 'cash_out'
  AND f.company_id IS NULL
  AND f.owner_user_id IS NULL
  AND f.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps existing
    WHERE existing.flow_id = f.id
  );


-- ============================================================
-- Replayed reviewed Global MTN definitions from migration 012.
-- ============================================================

-- Seeds five global (superuser-owned) MTN USSD flows, all confirmed
-- via live device mapping tonight: Airtime, Data Bundle, Check
-- Commission Balance, View Cash In Commission, and Transfer
-- Commission to Wallet. Each is inserted with its steps in the exact
-- order confirmed on-device. Uses a subquery to link steps to their
-- flow's id, relying on the existing unique index on
-- (provider, transaction_type) for global flows.

-- ============================================================
-- 1. Airtime
-- ============================================================
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'airtime', '*171#',
  ARRAY['airtime payment made', 'successful'],
  ARRAY['failed', 'insufficient', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='airtime' AND company_id IS NULL AND owner_user_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '5'),
  (2, ARRAY['airtime&bundles', '1) sell airtime'], 'send_digit', '1'),
  (3, ARRAY['enter mobile number'], 'send_customer_phone', NULL),
  (4, ARRAY['repeat mobile number'], 'send_customer_phone', NULL),
  (5, ARRAY['select amount'], 'send_digit', '5'),
  (6, ARRAY['enter amount'], 'send_amount', NULL),
  (7, ARRAY['enter mm pin'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='airtime' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);

-- ============================================================
-- 2. Data Bundle
-- ============================================================
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'data_bundle', '*171#',
  ARRAY['has been made successfully'],
  ARRAY['failed', 'insufficient', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='data_bundle' AND company_id IS NULL AND owner_user_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '5'),
  (2, ARRAY['airtime&bundles'], 'send_digit', '2'),
  (3, ARRAY['welcome to bundle portal'], 'send_digit', '1'),
  (4, ARRAY['buy for self', 'buy for others'], 'send_digit', '2'),
  (5, ARRAY['enter phone number'], 'send_customer_phone', NULL),
  (6, ARRAY['repeat', 'phone number'], 'send_customer_phone', NULL),
  (7, ARRAY['select data bundle', 'flexi bundles'], 'send_digit', '1'),
  (8, ARRAY['enter amount to buy preferred bundle'], 'send_amount', NULL),
  (9, ARRAY['this bundle does not expire'], 'send_digit', '1'),
  (10, ARRAY['choose payment mode', 'mobile money'], 'send_digit', '2'),
  (11, ARRAY['authorize payment', 'enter mm pin to continue'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='data_bundle' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);

-- ============================================================
-- 3. Check Commission Balance
-- ============================================================
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'commission_balance', '*171#',
  ARRAY['current commission balance'],
  ARRAY['failed', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='commission_balance' AND company_id IS NULL AND owner_user_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '7'),
  (2, ARRAY['my wallet', '1) check balance'], 'send_digit', '2'),
  (3, ARRAY['commissions', '1) check commission balance'], 'send_digit', '1'),
  (4, ARRAY['enter mm pin'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='commission_balance' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);

-- ============================================================
-- 4. View Cash In Commission
-- ============================================================
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'cash_in_commission', '*171#',
  ARRAY['transaction summary will be sent'],
  ARRAY['failed', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='cash_in_commission' AND company_id IS NULL AND owner_user_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '7'),
  (2, ARRAY['my wallet', '1) check balance'], 'send_digit', '2'),
  (3, ARRAY['commissions', '1) check commission balance'], 'send_digit', '3'),
  (4, ARRAY['enter mm pin'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='cash_in_commission' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);

-- ============================================================
-- 5. Transfer Commission to Wallet
-- ============================================================
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'commission_transfer', '*171#',
  ARRAY['transfer of amount', 'was successful'],
  ARRAY['failed', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='commission_transfer' AND company_id IS NULL AND owner_user_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '7'),
  (2, ARRAY['my wallet', '1) check balance'], 'send_digit', '2'),
  (3, ARRAY['commissions', '1) check commission balance'], 'send_digit', '2'),
  (4, ARRAY['enter amount to transfer'], 'send_amount', NULL),
  (5, ARRAY['from commissions to wallet'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='commission_transfer' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);


-- ============================================================
-- Replayed reviewed MTN Balance Enquiry from migration 020.
--
-- The original migration also disabled ussd_templates.balance_enquiry.
-- That UPDATE is deliberately not replayed here.
-- ============================================================

-- Converts MTN Balance Enquiry from the legacy single-dial template
-- (fixed in 019, but that was for a concatenated dial string that
-- can't actually reach an interactive PIN prompt) to a real
-- interactive Flow Builder entry, mapped step-by-step from live
-- device screenshots. This automatically supersedes the legacy
-- template for this combo, since the app already checks Flow Builder
-- before falling back to it - the legacy row is deactivated below
-- rather than deleted, so 019's fix stays intact as a harmless
-- historical record.
--
-- success_markers ('current balance', 'available balance') are
-- confirmed from a real completed transaction's final result screen.
-- failure_markers are NOT confirmed (no failure screenshot available)
-- and use the same broad generic terms as other flows - verify
-- against a real failure (e.g. wrong PIN) before fully trusting them.
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'balance_enquiry', '*171#',
  ARRAY['current balance', 'available balance'],
  ARRAY['failed', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='balance_enquiry' AND company_id IS NULL AND owner_user_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '7'),
  (2, ARRAY['1) check balance'], 'send_digit', '1'),
  (3, ARRAY['enter mm pin'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='balance_enquiry' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);
