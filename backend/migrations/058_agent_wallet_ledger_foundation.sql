-- ============================================================
-- Agent financial ledger foundation
-- ============================================================
--
-- The legacy agent_balances table combines three balances that do not
-- actually share the same accounting dimension:
--
--   e-Float            -> physical/unresolved SIM wallet
--   Commission         -> physical/unresolved SIM wallet
--   Cash at Hand       -> one physical cash drawer per agent
--
-- This migration introduces the correct balance targets while preserving
-- legacy data exactly as it is known today.
--
-- IMPORTANT:
-- Historical provider-level e-Float and commission balances are NOT split
-- between physical SIMs. Doing that would fabricate accounting history.
-- They are migrated into explicit "legacy_unassigned" wallets.
--
-- Historical cash IS safe to consolidate because the application has
-- always treated it as one physical drawer and shift reconciliation already
-- calculates SUM(cash_at_hand) across provider rows.
--
-- agent_balances is deliberately retained during the cutover. Application
-- reads/writes will be migrated and reconciled before that table is retired.


-- ============================================================
-- 1. ONE PHYSICAL CASH DRAWER PER AGENT
-- ============================================================

CREATE TABLE agent_cash_balances (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cash_at_hand      DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  last_updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(agent_id)
);

COMMENT ON TABLE agent_cash_balances IS
  'Single physical cash drawer per agent. Cash is not provider- or SIM-scoped.';


-- Composite key used by movement foreign keys to prove that a cash
-- target belongs to the same agent recorded on the movement.
CREATE UNIQUE INDEX idx_agent_cash_balance_owner
ON agent_cash_balances(id, agent_id);


-- ============================================================
-- 2. ELECTRONIC SIM WALLETS
-- ============================================================

CREATE TABLE agent_sim_wallets (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                 provider NOT NULL,

  -- identified:
  --   A durable ICCID is available.
  --
  -- unresolved:
  --   Android did not expose an ICCID. installation/subscription/slot is
  --   retained only as an unresolved observation and is NOT proof of a
  --   durable physical-SIM identity.
  --
  -- legacy_unassigned:
  --   Historical provider aggregate whose e-Float/commission cannot be
  --   truthfully attributed to one physical SIM.
  identity_status          VARCHAR(32) NOT NULL,

  sim_iccid                TEXT,
  installation_id          UUID,
  sim_subscription_id      INTEGER,
  last_known_sim_slot      INTEGER,

  e_float_balance          DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  commission_balance       DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  low_balance_threshold    DECIMAL(15, 2) NOT NULL DEFAULT 500.00,

  -- Only populated for legacy_unassigned wallets created from the old
  -- provider-level balance table. This keeps migration provenance explicit.
  legacy_agent_balance_id  UUID REFERENCES agent_balances(id),

  last_updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_agent_sim_wallet_identity_status
    CHECK (
      identity_status IN (
        'identified',
        'unresolved',
        'legacy_unassigned'
      )
    ),

  CONSTRAINT chk_agent_sim_wallet_subscription
    CHECK (
      sim_subscription_id IS NULL OR sim_subscription_id >= 0
    ),

  CONSTRAINT chk_agent_sim_wallet_slot
    CHECK (
      last_known_sim_slot IS NULL OR last_known_sim_slot >= 0
    ),

  CONSTRAINT chk_agent_sim_wallet_identity_shape
    CHECK (
      (
        identity_status = 'identified'
        AND NULLIF(BTRIM(sim_iccid), '') IS NOT NULL
      )
      OR
      (
        identity_status = 'unresolved'
        AND NULLIF(BTRIM(sim_iccid), '') IS NULL
        AND installation_id IS NOT NULL
        AND sim_subscription_id IS NOT NULL
        AND last_known_sim_slot IS NOT NULL
      )
      OR
      (
        identity_status = 'legacy_unassigned'
        AND NULLIF(BTRIM(sim_iccid), '') IS NULL
        AND installation_id IS NULL
        AND sim_subscription_id IS NULL
        AND last_known_sim_slot IS NULL
        AND legacy_agent_balance_id IS NOT NULL
      )
    )
);

COMMENT ON TABLE agent_sim_wallets IS
  'Electronic wallets for agent e-Float and commission, separated by physical or unresolved SIM identity.';

COMMENT ON COLUMN agent_sim_wallets.identity_status IS
  'identified=ICCID-backed; unresolved=device/subscription/slot observation; legacy_unassigned=historical provider aggregate not attributable to a physical SIM.';

COMMENT ON COLUMN agent_sim_wallets.last_known_sim_slot IS
  'SIM slot is observation metadata. For unresolved wallets it participates in conservative identity separation but is never proof of physical SIM identity.';


-- A durable ICCID uniquely identifies an observed wallet for an
-- agent/provider combination.
CREATE UNIQUE INDEX idx_agent_sim_wallet_identified
ON agent_sim_wallets (
  agent_id,
  provider,
  sim_iccid
)
WHERE identity_status = 'identified';


-- Unresolved observations are intentionally conservative. A change in
-- installation, Android subscription, OR slot creates a separate unresolved
-- wallet rather than silently merging money that may belong to another SIM.
CREATE UNIQUE INDEX idx_agent_sim_wallet_unresolved
ON agent_sim_wallets (
  agent_id,
  provider,
  installation_id,
  sim_subscription_id,
  last_known_sim_slot
)
WHERE identity_status = 'unresolved';


-- Exactly one historical provider aggregate is preserved per old
-- agent/provider row.
CREATE UNIQUE INDEX idx_agent_sim_wallet_legacy_provider
ON agent_sim_wallets (
  agent_id,
  provider
)
WHERE identity_status = 'legacy_unassigned';


CREATE UNIQUE INDEX idx_agent_sim_wallet_legacy_source
ON agent_sim_wallets (legacy_agent_balance_id)
WHERE legacy_agent_balance_id IS NOT NULL;


CREATE INDEX idx_agent_sim_wallet_agent_provider
ON agent_sim_wallets(agent_id, provider);


-- Composite key used by transactions and movements so a linked wallet
-- must belong to the same agent and provider.
CREATE UNIQUE INDEX idx_agent_sim_wallet_owner_provider
ON agent_sim_wallets(id, agent_id, provider);


-- ============================================================
-- 3. MIGRATE CURRENT CASH INTO ONE DRAWER
-- ============================================================
--
-- This is the same accounting rule the shift controller already uses:
-- one physical drawer = SUM(cash_at_hand) across legacy provider rows.

INSERT INTO agent_cash_balances (
  agent_id,
  cash_at_hand,
  last_updated_at,
  created_at
)
SELECT
  agent_id,
  SUM(cash_at_hand),
  MAX(last_updated_at),
  MIN(created_at)
FROM agent_balances
GROUP BY agent_id;


-- ============================================================
-- 4. PRESERVE LEGACY ELECTRONIC BALANCES WITHOUT INVENTING SIM OWNERSHIP
-- ============================================================

INSERT INTO agent_sim_wallets (
  agent_id,
  provider,
  identity_status,
  e_float_balance,
  commission_balance,
  low_balance_threshold,
  legacy_agent_balance_id,
  last_updated_at,
  created_at
)
SELECT
  agent_id,
  provider,
  'legacy_unassigned',
  e_float_balance,
  commission_balance,
  low_balance_threshold,
  id,
  last_updated_at,
  created_at
FROM agent_balances;


-- ============================================================
-- 5. CREATE ZERO-BALANCE IDENTIFIED WALLET RECORDS FROM HISTORICAL
--    TRANSACTION PROVENANCE
-- ============================================================
--
-- These rows establish which physical SIM identities have actually been
-- observed. They receive ZERO opening balances because the old provider
-- aggregate cannot be allocated to them truthfully.

INSERT INTO agent_sim_wallets (
  agent_id,
  provider,
  identity_status,
  sim_iccid,
  installation_id,
  sim_subscription_id,
  last_known_sim_slot,
  e_float_balance,
  commission_balance,
  created_at,
  last_updated_at
)
SELECT DISTINCT ON (
  t.agent_id,
  t.provider,
  BTRIM(t.sim_iccid)
)
  t.agent_id,
  t.provider,
  'identified',
  BTRIM(t.sim_iccid),
  t.installation_id,
  t.sim_subscription_id,
  t.sim_slot,
  0.00,
  0.00,
  t.created_at,
  COALESCE(t.completed_at, t.created_at)
FROM transactions t
WHERE NULLIF(BTRIM(t.sim_iccid), '') IS NOT NULL
ORDER BY
  t.agent_id,
  t.provider,
  BTRIM(t.sim_iccid),
  t.created_at DESC;


-- ============================================================
-- 6. CREATE ZERO-BALANCE UNRESOLVED WALLET RECORDS
-- ============================================================

INSERT INTO agent_sim_wallets (
  agent_id,
  provider,
  identity_status,
  installation_id,
  sim_subscription_id,
  last_known_sim_slot,
  e_float_balance,
  commission_balance,
  created_at,
  last_updated_at
)
SELECT DISTINCT ON (
  t.agent_id,
  t.provider,
  t.installation_id,
  t.sim_subscription_id,
  t.sim_slot
)
  t.agent_id,
  t.provider,
  'unresolved',
  t.installation_id,
  t.sim_subscription_id,
  t.sim_slot,
  0.00,
  0.00,
  t.created_at,
  COALESCE(t.completed_at, t.created_at)
FROM transactions t
WHERE NULLIF(BTRIM(t.sim_iccid), '') IS NULL
  AND t.installation_id IS NOT NULL
  AND t.sim_subscription_id IS NOT NULL
  AND t.sim_slot IS NOT NULL
ORDER BY
  t.agent_id,
  t.provider,
  t.installation_id,
  t.sim_subscription_id,
  t.sim_slot,
  t.created_at DESC;


-- ============================================================
-- 7. LINK TRANSACTIONS TO THEIR OBSERVED SIM WALLET
-- ============================================================
--
-- A transaction link expresses SIM provenance.
-- It does NOT move historical legacy balances into that wallet.

ALTER TABLE transactions
  ADD COLUMN sim_wallet_id UUID;


ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_sim_wallet_owner
  FOREIGN KEY (sim_wallet_id, agent_id, provider)
  REFERENCES agent_sim_wallets(id, agent_id, provider);


UPDATE transactions t
SET sim_wallet_id = w.id
FROM agent_sim_wallets w
WHERE w.agent_id = t.agent_id
  AND w.provider = t.provider
  AND w.identity_status = 'identified'
  AND NULLIF(BTRIM(t.sim_iccid), '') IS NOT NULL
  AND w.sim_iccid = BTRIM(t.sim_iccid);


UPDATE transactions t
SET sim_wallet_id = w.id
FROM agent_sim_wallets w
WHERE t.sim_wallet_id IS NULL
  AND w.agent_id = t.agent_id
  AND w.provider = t.provider
  AND w.identity_status = 'unresolved'
  AND NULLIF(BTRIM(t.sim_iccid), '') IS NULL
  AND w.installation_id = t.installation_id
  AND w.sim_subscription_id = t.sim_subscription_id
  AND w.last_known_sim_slot = t.sim_slot;


CREATE INDEX idx_transactions_sim_wallet
ON transactions(sim_wallet_id)
WHERE sim_wallet_id IS NOT NULL;


-- ============================================================
-- 8. GIVE EVERY BALANCE MOVEMENT AN EXPLICIT FINANCIAL TARGET
-- ============================================================
--
-- cash_balance_id = one agent cash drawer
-- sim_wallet_id   = one electronic wallet
--
-- SIM provenance is snapshotted independently from the balance target.
-- This matters for historical rows: a movement can truthfully say which
-- physical SIM performed a transaction while its migrated balance target
-- remains legacy_unassigned because historical cumulative balances cannot
-- be safely split.

-- Provider identifies the electronic wallet dimension, but it must not
-- identify physical cash. Cash is one drawer per agent. Existing
-- transaction-linked cash movements may still retain provider as context.
ALTER TABLE agent_balance_movements
  ALTER COLUMN provider DROP NOT NULL;


ALTER TABLE agent_balance_movements
  ADD COLUMN cash_balance_id UUID,
  ADD COLUMN sim_wallet_id UUID,
  ADD COLUMN sim_iccid TEXT,
  ADD COLUMN installation_id UUID,
  ADD COLUMN sim_subscription_id INTEGER,
  ADD COLUMN sim_slot INTEGER,
  ADD COLUMN sim_provenance_status VARCHAR(20);


ALTER TABLE agent_balance_movements
  ADD CONSTRAINT fk_agent_balance_movement_cash_owner
  FOREIGN KEY (cash_balance_id, agent_id)
  REFERENCES agent_cash_balances(id, agent_id);


ALTER TABLE agent_balance_movements
  ADD CONSTRAINT fk_agent_balance_movement_sim_wallet_owner
  FOREIGN KEY (sim_wallet_id, agent_id, provider)
  REFERENCES agent_sim_wallets(id, agent_id, provider);


-- Cash movements always target the one drawer belonging to that agent.
UPDATE agent_balance_movements m
SET cash_balance_id = c.id
FROM agent_cash_balances c
WHERE m.balance_type = 'cash_at_hand'
  AND c.agent_id = m.agent_id;


-- Existing e-Float and commission closing balances remain in the migrated
-- legacy provider wallet, so historical movements target that same wallet.
-- We preserve exact physical-SIM provenance separately below.
UPDATE agent_balance_movements m
SET sim_wallet_id = w.id
FROM agent_sim_wallets w
WHERE m.balance_type IN ('e_float', 'commission')
  AND w.identity_status = 'legacy_unassigned'
  AND w.agent_id = m.agent_id
  AND w.provider = m.provider;


-- Snapshot transaction SIM provenance onto every linked movement,
-- including cash movements.
UPDATE agent_balance_movements m
SET
  sim_iccid = NULLIF(BTRIM(t.sim_iccid), ''),
  installation_id = t.installation_id,
  sim_subscription_id = t.sim_subscription_id,
  sim_slot = t.sim_slot,
  sim_provenance_status =
    CASE
      WHEN NULLIF(BTRIM(t.sim_iccid), '') IS NOT NULL
        THEN 'identified'
      WHEN t.installation_id IS NOT NULL
        AND t.sim_subscription_id IS NOT NULL
        AND t.sim_slot IS NOT NULL
        THEN 'unresolved'
      ELSE 'unavailable'
    END
FROM transactions t
WHERE m.transaction_id = t.id;


UPDATE agent_balance_movements
SET sim_provenance_status =
  CASE
    -- These are pure cash-drawer events. No SIM identity is expected.
    WHEN balance_type = 'cash_at_hand'
      AND transaction_id IS NULL
      AND movement_type IN (
        'cash_set',
        'cash_injection',
        'cash_withdrawal'
      )
      THEN 'not_applicable'

    -- For other historical rows we simply do not have enough evidence
    -- to identify the SIM that produced the movement.
    ELSE 'unavailable'
  END
WHERE sim_provenance_status IS NULL;


-- ============================================================
-- 9. FAIL MIGRATION IF ANY OLD MOVEMENT COULD NOT BE MAPPED
-- ============================================================
--
-- Never silently leave historical money without a balance target.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM agent_balance_movements
    WHERE balance_type = 'cash_at_hand'
      AND cash_balance_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot migrate ledger: at least one historical cash movement has no agent cash drawer';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_balance_movements
    WHERE balance_type IN ('e_float', 'commission')
      AND sim_wallet_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot migrate ledger: at least one historical electronic movement has no legacy SIM wallet';
  END IF;
END
$$;


-- ============================================================
-- 10. ENFORCE TARGET + PROVENANCE INTEGRITY
-- ============================================================

ALTER TABLE agent_balance_movements
  ADD CONSTRAINT chk_agent_balance_movement_target
  CHECK (
    (
      balance_type = 'cash_at_hand'
      AND cash_balance_id IS NOT NULL
      AND sim_wallet_id IS NULL
    )
    OR
    (
      balance_type IN ('e_float', 'commission')
      AND provider IS NOT NULL
      AND sim_wallet_id IS NOT NULL
      AND cash_balance_id IS NULL
    )
  );


ALTER TABLE agent_balance_movements
  ADD CONSTRAINT chk_agent_balance_movement_sim_provenance_status
  CHECK (
    sim_provenance_status IN (
      'identified',
      'unresolved',
      'unavailable',
      'not_applicable'
    )
  );


ALTER TABLE agent_balance_movements
  ADD CONSTRAINT chk_agent_balance_movement_sim_provenance_shape
  CHECK (
    (
      sim_provenance_status = 'identified'
      AND NULLIF(BTRIM(sim_iccid), '') IS NOT NULL
    )
    OR
    (
      sim_provenance_status = 'unresolved'
      AND NULLIF(BTRIM(sim_iccid), '') IS NULL
      AND installation_id IS NOT NULL
      AND sim_subscription_id IS NOT NULL
      AND sim_slot IS NOT NULL
    )
    OR
    (
      sim_provenance_status = 'unavailable'
    )
    OR
    (
      sim_provenance_status = 'not_applicable'
      AND NULLIF(BTRIM(sim_iccid), '') IS NULL
      AND installation_id IS NULL
      AND sim_subscription_id IS NULL
      AND sim_slot IS NULL
    )
  );


CREATE INDEX idx_agent_balance_movements_cash_balance
ON agent_balance_movements(cash_balance_id)
WHERE cash_balance_id IS NOT NULL;


CREATE INDEX idx_agent_balance_movements_sim_wallet
ON agent_balance_movements(sim_wallet_id)
WHERE sim_wallet_id IS NOT NULL;


CREATE INDEX idx_agent_balance_movements_transaction
ON agent_balance_movements(transaction_id)
WHERE transaction_id IS NOT NULL;


COMMENT ON COLUMN agent_balance_movements.provider IS
  'Required for electronic movements. For cash movements it is optional source/transaction context and never identifies the physical cash balance.';


COMMENT ON COLUMN agent_balance_movements.cash_balance_id IS
  'Financial target for physical cash movements. Exactly one cash drawer exists per agent.';

COMMENT ON COLUMN agent_balance_movements.sim_wallet_id IS
  'Financial target for e-Float or commission movements. Historical rows remain attached to legacy_unassigned wallets until explicit reconciliation.';

COMMENT ON COLUMN agent_balance_movements.sim_provenance_status IS
  'SIM evidence when the movement occurred: identified, unresolved, unavailable, or not_applicable for cash-only events.';
