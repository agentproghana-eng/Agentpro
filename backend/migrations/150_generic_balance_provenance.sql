-- ============================================================
-- Generic role-specific balance provenance
-- ============================================================
--
-- A structural current_balance of 0.00 is NOT evidence that a
-- provider reported a zero balance.
--
-- Existing generic balance rows therefore start UNKNOWN.
-- No existing current_balance value is promoted to KNOWN here.
-- ============================================================

ALTER TABLE sim_wallet_balance_accounts
  ADD COLUMN IF NOT EXISTS balance_state VARCHAR(16)
    NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS balance_source VARCHAR(64),
  ADD COLUMN IF NOT EXISTS balance_observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS balance_initialized_at TIMESTAMPTZ;

ALTER TABLE sim_wallet_balance_accounts
  DROP CONSTRAINT IF EXISTS chk_sim_wallet_balance_account_state;

ALTER TABLE sim_wallet_balance_accounts
  ADD CONSTRAINT chk_sim_wallet_balance_account_state
  CHECK (balance_state IN ('unknown', 'known'));

ALTER TABLE sim_wallet_balance_accounts
  DROP CONSTRAINT IF EXISTS chk_sim_wallet_balance_account_provenance;

ALTER TABLE sim_wallet_balance_accounts
  ADD CONSTRAINT chk_sim_wallet_balance_account_provenance
  CHECK (
    (
      balance_state = 'unknown'
      AND balance_source IS NULL
      AND balance_observed_at IS NULL
      AND balance_initialized_at IS NULL
    )
    OR
    (
      balance_state = 'known'
      AND balance_source IS NOT NULL
      AND balance_observed_at IS NOT NULL
      AND balance_initialized_at IS NOT NULL
    )
  );

COMMENT ON COLUMN sim_wallet_balance_accounts.balance_state IS
  'Whether current_balance is financially initialized. unknown means current_balance must not be interpreted as a provider-observed balance.';

COMMENT ON COLUMN sim_wallet_balance_accounts.balance_source IS
  'Provenance of the observed balance used to initialize or reconcile this account.';

COMMENT ON COLUMN sim_wallet_balance_accounts.balance_observed_at IS
  'Time at which the balance was observed from its authoritative or controlled reconciliation source.';

COMMENT ON COLUMN sim_wallet_balance_accounts.balance_initialized_at IS
  'Time at which this account first became financially initialized in AgentPro.';

-- Deliberately no UPDATE setting existing accounts to known.
-- Deliberately no fabricated opening balances.
