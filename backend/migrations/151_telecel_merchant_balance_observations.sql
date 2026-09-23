-- ============================================================
-- Telecel Merchant balance observation ledger
-- ============================================================
--
-- Immutable provenance for a trusted observation containing
-- BOTH Telecel Merchant financial balances:
--
--   Merchant Account
--   Working Account
--
-- This migration does not initialize any balance.
-- No SMS parser or client-write endpoint is introduced here.
-- ============================================================

CREATE TABLE telecel_merchant_balance_observations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  sim_wallet_id UUID NOT NULL
    REFERENCES agent_sim_wallets(id)
    ON DELETE RESTRICT,

  source VARCHAR(64) NOT NULL,
  source_reference VARCHAR(128) NOT NULL,

  merchant_account_balance DECIMAL(15, 2) NOT NULL,
  working_account_balance DECIMAL(15, 2) NOT NULL,

  observed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_telecel_merchant_observation_source
    CHECK (
      source ~ '^[a-z][a-z0-9_]{0,63}$'
    ),

  CONSTRAINT chk_telecel_merchant_observation_reference
    CHECK (
      length(trim(source_reference)) > 0
    ),

  CONSTRAINT chk_telecel_merchant_observation_balances
    CHECK (
      merchant_account_balance >= 0
      AND working_account_balance >= 0
    ),

  UNIQUE (
    sim_wallet_id,
    source,
    source_reference
  )
);

CREATE INDEX idx_telecel_merchant_balance_observations_wallet
ON telecel_merchant_balance_observations (
  sim_wallet_id,
  observed_at DESC
);

COMMENT ON TABLE telecel_merchant_balance_observations IS
  'Immutable trusted observations of both Telecel Merchant balances for one exact role-scoped SIM wallet.';

COMMENT ON COLUMN telecel_merchant_balance_observations.source_reference IS
  'Opaque replay-protection identifier produced by the trusted observation source. It must not contain SMS body text, PINs, Operator IDs, or Organisation Shortcodes.';

-- Deliberately no opening balances.
-- Deliberately no UPDATE of existing balance accounts.
-- Deliberately no client-write endpoint.
