-- Per-agent balance tracking: e-Float, Cash at Hand, and Commission are
-- three genuinely separate things an individual agent holds (their own
-- SIM's e-float, their own physical cash, their own accrued commission),
-- not a shared branch-level pool. This sits alongside the existing
-- branch-level float_accounts table (used by the owner/manager Top Up
-- flow), rather than replacing it.

CREATE TABLE agent_balances (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            provider NOT NULL,
  e_float_balance     DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  cash_at_hand        DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  commission_balance  DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  low_balance_threshold DECIMAL(15, 2) NOT NULL DEFAULT 500.00,
  last_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id, provider)
);

CREATE TYPE agent_balance_movement_type AS ENUM (
  'cash_out_manual',
  'float_received',
  'commission_transfer',
  'cash_set',
  'cash_injection',
  'cash_withdrawal',
  'charge_collected'
);

CREATE TYPE agent_balance_type AS ENUM (
  'e_float',
  'cash_at_hand',
  'commission'
);

-- Every movement is logged here, whichever balance(s) it affects.
-- cash_injection/cash_withdrawal are the only types requiring approval;
-- all others take effect immediately (self-reported or auto-recorded).
CREATE TABLE agent_balance_movements (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id          UUID NOT NULL REFERENCES users(id),
  provider          provider NOT NULL,
  movement_type     agent_balance_movement_type NOT NULL,
  balance_type      agent_balance_type NOT NULL,
  amount            DECIMAL(15, 2) NOT NULL,
  balance_before     DECIMAL(15, 2) NOT NULL,
  balance_after      DECIMAL(15, 2) NOT NULL,
  reference         VARCHAR(255),
  notes             TEXT,
  transaction_id    UUID REFERENCES transactions(id),
  -- Only meaningful for cash_injection / cash_withdrawal
  status            VARCHAR(20) NOT NULL DEFAULT 'completed', -- completed, pending, approved, rejected
  reviewed_by       UUID REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_balance_movements_agent ON agent_balance_movements(agent_id);
CREATE INDEX idx_agent_balance_movements_status ON agent_balance_movements(status) WHERE status = 'pending';
