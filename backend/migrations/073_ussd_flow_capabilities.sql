-- Data-driven USSD Flow Builder capability registry.
--
-- `provider` remains a PostgreSQL enum and is therefore discovered directly
-- from the database schema. Adding a provider continues to require an explicit
-- migration so accounting/storage code sees the same registered value.
--
-- Transaction types are also PostgreSQL enum values, but not every transaction
-- type belongs to every account mode. This table records that semantic
-- eligibility without duplicating closed lists in Flutter or route files.
--
-- A future transaction type becomes available to Flow Builder by:
--   1. registering the transaction_type enum value through a migration; and
--   2. inserting the appropriate Business and/or Personal capability row.
--
-- This is configuration, not a hard-coded application allowlist.

CREATE TABLE IF NOT EXISTS ussd_flow_capabilities (
  transaction_type transaction_type NOT NULL,
  account_mode TEXT NOT NULL
    CHECK (account_mode IN ('business', 'personal')),
  display_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  can_initiate BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (transaction_type, account_mode)
);

CREATE INDEX IF NOT EXISTS idx_ussd_flow_capabilities_mode_active
  ON ussd_flow_capabilities(account_mode, transaction_type)
  WHERE is_active = TRUE;

-- Existing Business transaction semantics.
INSERT INTO ussd_flow_capabilities (
  transaction_type,
  account_mode,
  display_label,
  can_initiate
)
VALUES
  ('cash_in', 'business', 'Cash In', TRUE),
  ('cash_out', 'business', 'Cash Out', TRUE),
  ('send_money', 'business', 'Send Money', TRUE),
  ('merchant_payment', 'business', 'Merchant Payment', TRUE),
  ('commission_balance', 'business', 'Commission Balance', TRUE),
  ('cash_in_commission', 'business', 'Cash In Commission', TRUE),
  ('cash_out_commission', 'business', 'Cash Out Commission', FALSE),
  ('commission_transfer', 'business', 'Commission Transfer', TRUE),
  ('working_to_float', 'business', 'Working to Float', TRUE),
  ('float_to_working', 'business', 'Float to Working', TRUE),
  ('business_deposit', 'business', 'Business Deposit', TRUE),
  ('business_withdrawal', 'business', 'Business Withdrawal', TRUE),
  ('bill_payment', 'business', 'Pay to Agent', TRUE),
  ('airtime', 'business', 'Airtime', TRUE),
  ('data_bundle', 'business', 'Data Bundle', TRUE),
  ('balance_enquiry', 'business', 'Balance Enquiry', TRUE),
  ('mini_statement', 'business', 'Mini Statement', TRUE),
  ('reversal', 'business', 'Reversal', TRUE)
ON CONFLICT (transaction_type, account_mode) DO UPDATE
SET
  display_label = EXCLUDED.display_label,
  is_active = TRUE,
  can_initiate = EXCLUDED.can_initiate,
  updated_at = NOW();

-- Existing Personal transaction semantics.
INSERT INTO ussd_flow_capabilities (
  transaction_type,
  account_mode,
  display_label,
  can_initiate
)
VALUES
  ('send_money_same_network', 'personal', 'Send Money (Same Network)', TRUE),
  ('send_money_cross_network', 'personal', 'Send Money (Other Network)', TRUE),
  ('buy_airtime', 'personal', 'Buy Airtime', TRUE),
  ('buy_data', 'personal', 'Buy Data', TRUE),
  ('buy_mashup', 'personal', 'Mash Up', TRUE),
  ('check_momo_balance', 'personal', 'Check MoMo Balance', TRUE),
  ('check_airtime_balance', 'personal', 'Check Airtime Balance', TRUE),
  ('withdraw_cash', 'personal', 'Withdraw Cash', TRUE)
ON CONFLICT (transaction_type, account_mode) DO UPDATE
SET
  display_label = EXCLUDED.display_label,
  is_active = TRUE,
  can_initiate = EXCLUDED.can_initiate,
  updated_at = NOW();

COMMENT ON TABLE ussd_flow_capabilities IS
  'Mode-specific USSD transaction capability registry. is_active controls Flow Builder exposure; can_initiate controls transaction initiation eligibility. Providers are discovered from the PostgreSQL provider enum.';
