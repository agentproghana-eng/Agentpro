-- Shift open/close reconciliation. Agents open a shift (the system
-- snapshots their current expected cash across every provider), work
-- through transactions, then close by declaring their actual
-- physically-counted cash. The gap between what agent_balances already
-- expected and what the agent counted is the variance - this is the
-- first time the app surfaces that gap explicitly, rather than
-- silently overwriting it via the existing cash_set adjustment.
--
-- Cash is tracked as ONE total across providers, not per-provider -
-- agents keep a single physical cash drawer regardless of how many
-- provider e-float wallets feed into it.
CREATE TYPE shift_status AS ENUM ('open', 'closed');

CREATE TABLE shifts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id             UUID REFERENCES branches(id),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status                shift_status NOT NULL DEFAULT 'open',
  opening_cash_expected DECIMAL(15, 2) NOT NULL,
  opened_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closing_cash_expected DECIMAL(15, 2),
  closing_cash_actual   DECIMAL(15, 2),
  variance              DECIMAL(15, 2),
  transaction_count     INTEGER,
  notes                 TEXT,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shifts_agent_status ON shifts(agent_id, status);
CREATE INDEX idx_shifts_company_closed ON shifts(company_id, closed_at DESC);

CREATE UNIQUE INDEX idx_shifts_one_open_per_agent ON shifts(agent_id) WHERE status = 'open';

INSERT INTO system_config (key, value, description)
SELECT 'shift_variance_flag_threshold', '20.00',
  'Absolute cash variance (GHS) at shift close that gets flagged for owner/manager attention.'
WHERE NOT EXISTS (SELECT 1 FROM system_config WHERE key = 'shift_variance_flag_threshold');
