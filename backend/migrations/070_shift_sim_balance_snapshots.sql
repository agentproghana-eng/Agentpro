-- ============================================================
-- 070: Exact-SIM shift balance snapshots
-- ============================================================
--
-- One row represents one electronic balance type belonging to one
-- exact/unresolved SIM wallet for one shift.
--
-- Opening:
--   opening_expected = canonical wallet balance when shift opens
--   opening_declared = amount explicitly declared by the user
--   opening_variance = declared - expected
--
-- Closing columns are included now for the matching end-of-shift
-- reconciliation phase. They remain NULL until the shift closes.
--
-- Snapshot declarations NEVER mutate agent_sim_wallets.

CREATE TABLE shift_sim_balance_snapshots (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  shift_id            UUID NOT NULL
                        REFERENCES shifts(id) ON DELETE CASCADE,

  sim_wallet_id       UUID NOT NULL
                        REFERENCES agent_sim_wallets(id),

  balance_type        agent_balance_type NOT NULL,

  opening_expected    DECIMAL(15, 2) NOT NULL,
  opening_declared    DECIMAL(15, 2) NOT NULL,
  opening_variance    DECIMAL(15, 2) NOT NULL,

  closing_expected    DECIMAL(15, 2),
  closing_declared    DECIMAL(15, 2),
  closing_variance    DECIMAL(15, 2),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_shift_sim_snapshot_balance_type
    CHECK (
      balance_type IN (
        'e_float',
        'commission',
        'working_balance'
      )
    ),

  CONSTRAINT chk_shift_sim_snapshot_opening_declared
    CHECK (opening_declared >= 0),

  CONSTRAINT chk_shift_sim_snapshot_closing_declared
    CHECK (
      closing_declared IS NULL
      OR closing_declared >= 0
    ),

  UNIQUE (
    shift_id,
    sim_wallet_id,
    balance_type
  )
);

CREATE INDEX idx_shift_sim_snapshots_shift
ON shift_sim_balance_snapshots(shift_id);

CREATE INDEX idx_shift_sim_snapshots_wallet
ON shift_sim_balance_snapshots(sim_wallet_id);

COMMENT ON TABLE shift_sim_balance_snapshots IS
  'Per-shift reconciliation snapshots for exact or conservatively unresolved SIM electronic balances.';

COMMENT ON COLUMN shift_sim_balance_snapshots.opening_variance IS
  'Opening declared balance minus opening expected canonical wallet balance.';

COMMENT ON COLUMN shift_sim_balance_snapshots.closing_variance IS
  'Closing declared balance minus closing expected canonical wallet balance.';
