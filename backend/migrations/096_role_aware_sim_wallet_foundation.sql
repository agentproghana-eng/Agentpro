-- ============================================================
-- 096: Role-aware physical SIM wallet foundation
-- ============================================================
--
-- User account role and physical SIM role are independent.
--
-- Transaction-capable user roles may include:
--   agent
--   manager
--   business_owner
--
-- Physical SIM roles are:
--   agent
--   subscriber
--   merchant
--   evd
--
-- EVD is MTN-only.
--
-- This migration does not redistribute, copy, infer, or reclassify
-- any existing electronic balance.
--
-- Every existing agent_sim_wallets row predates explicit financial
-- SIM-role identity and therefore remains Agent role.
--
-- Existing Agent balance columns remain authoritative during the
-- staged rollout:
--
--   e_float_balance
--   commission_balance
--   working_balance
--
-- Generic balance-account tables below provide the future financial
-- domain for Merchant, MTN EVD, Subscriber and additional validated
-- provider-specific balances without adding one database column for
-- every future operator product.
--
-- The historical table name agent_sim_wallets is retained during the
-- staged commercial cutover to avoid a high-risk simultaneous rewrite
-- of all proven Agent posting and reconciliation paths.
-- ============================================================


-- ============================================================
-- 1. MAKE SIM ROLE PART OF WALLET IDENTITY
-- ============================================================

ALTER TABLE agent_sim_wallets
  ADD COLUMN IF NOT EXISTS sim_role TEXT;

UPDATE agent_sim_wallets
SET sim_role = 'agent'
WHERE sim_role IS NULL
   OR BTRIM(sim_role) = '';

ALTER TABLE agent_sim_wallets
  ALTER COLUMN sim_role SET DEFAULT 'agent';

ALTER TABLE agent_sim_wallets
  ALTER COLUMN sim_role SET NOT NULL;

ALTER TABLE agent_sim_wallets
  DROP CONSTRAINT IF EXISTS
    chk_agent_sim_wallet_sim_role;

ALTER TABLE agent_sim_wallets
  ADD CONSTRAINT chk_agent_sim_wallet_sim_role
  CHECK (
    sim_role IN (
      'agent',
      'subscriber',
      'merchant',
      'evd'
    )
  );

-- EVD is an MTN-specific operational SIM role.
ALTER TABLE agent_sim_wallets
  DROP CONSTRAINT IF EXISTS
    chk_agent_sim_wallet_role_provider;

ALTER TABLE agent_sim_wallets
  ADD CONSTRAINT chk_agent_sim_wallet_role_provider
  CHECK (
    sim_role <> 'evd'
    OR provider = 'mtn'
  );

-- Historical provider aggregates were created only from the old
-- Agent accounting model. Never reinterpret them as another role.
ALTER TABLE agent_sim_wallets
  DROP CONSTRAINT IF EXISTS
    chk_agent_sim_wallet_legacy_role;

ALTER TABLE agent_sim_wallets
  ADD CONSTRAINT chk_agent_sim_wallet_legacy_role
  CHECK (
    identity_status <> 'legacy_unassigned'
    OR sim_role = 'agent'
  );


-- ============================================================
-- 1B. PERSIST BUSINESS SIM ROLE ON NEW TRANSACTIONS
-- ============================================================
--
-- SIM role is verified before Business transaction initiation.
-- Persisting that role is required so completion and financial posting
-- cannot later reinterpret an EVD or Merchant transaction as Agent.
--
-- Existing rows remain NULL because their original role was not stored.
-- Runtime compatibility may interpret historical NULL as legacy Agent,
-- but no migration fabricates a role for old rows.
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS sim_role TEXT;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS
    chk_transactions_business_sim_role;

ALTER TABLE transactions
  ADD CONSTRAINT chk_transactions_business_sim_role
  CHECK (
    sim_role IS NULL
    OR sim_role IN (
      'agent',
      'evd',
      'merchant'
    )
  );

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS
    chk_transactions_sim_role_provider;

ALTER TABLE transactions
  ADD CONSTRAINT chk_transactions_sim_role_provider
  CHECK (
    sim_role IS NULL
    OR sim_role <> 'evd'
    OR provider = 'mtn'
  );

CREATE INDEX IF NOT EXISTS idx_transactions_sim_role
ON transactions (
  agent_id,
  sim_role,
  created_at DESC
)
WHERE sim_role IS NOT NULL;

COMMENT ON COLUMN transactions.sim_role IS
  'Verified Business SIM role used to execute this transaction. NULL is retained only for historical rows whose role was not persisted.';


-- ============================================================
-- 2. ROLE-AWARE PHYSICAL SIM UNIQUENESS
-- ============================================================
--
-- A physical SIM changing operational role must not cause old Agent
-- money to become Merchant or EVD money.
--
-- The same physical identity may therefore have a separate financial
-- wallet for each operational role. Historical Agent rows remain Agent.
-- ============================================================

DROP INDEX IF EXISTS idx_agent_sim_wallet_identified;

CREATE UNIQUE INDEX idx_agent_sim_wallet_identified
ON agent_sim_wallets (
  agent_id,
  provider,
  sim_role,
  sim_iccid
)
WHERE identity_status = 'identified';


DROP INDEX IF EXISTS idx_agent_sim_wallet_unresolved;

CREATE UNIQUE INDEX idx_agent_sim_wallet_unresolved
ON agent_sim_wallets (
  agent_id,
  provider,
  sim_role,
  installation_id,
  sim_subscription_id,
  last_known_sim_slot
)
WHERE identity_status = 'unresolved';


CREATE INDEX IF NOT EXISTS idx_agent_sim_wallet_role
ON agent_sim_wallets (
  agent_id,
  provider,
  sim_role
);


COMMENT ON COLUMN agent_sim_wallets.sim_role IS
  'Operational role of this wallet identity: agent, subscriber, merchant, or MTN-only evd. User account role is a separate authorization dimension.';

COMMENT ON TABLE agent_sim_wallets IS
  'Role-scoped electronic wallets by authenticated operator, provider and physical or unresolved SIM identity. Legacy table name retained during staged commercial migration.';


-- ============================================================
-- 3. PROVIDER + ROLE BALANCE CAPABILITY DEFINITIONS
-- ============================================================
--
-- A role existing in the architecture does not mean that AgentPro
-- knows the provider balance semantics yet.
--
-- New balance types stay unavailable until explicitly validated.
-- Active definitions must therefore also be validated.
-- ============================================================

CREATE TABLE sim_wallet_balance_definitions (
  provider              provider NOT NULL,
  sim_role              TEXT NOT NULL,
  balance_code          VARCHAR(64) NOT NULL,
  display_label         VARCHAR(100) NOT NULL,
  is_validated          BOOLEAN NOT NULL DEFAULT FALSE,
  is_active             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (
    provider,
    sim_role,
    balance_code
  ),

  CONSTRAINT chk_sim_wallet_balance_definition_role
    CHECK (
      sim_role IN (
        'agent',
        'subscriber',
        'merchant',
        'evd'
      )
    ),

  CONSTRAINT chk_sim_wallet_balance_definition_provider
    CHECK (
      sim_role <> 'evd'
      OR provider = 'mtn'
    ),

  CONSTRAINT chk_sim_wallet_balance_definition_code
    CHECK (
      balance_code ~ '^[a-z][a-z0-9_]{0,63}$'
    ),

  CONSTRAINT chk_sim_wallet_balance_definition_activation
    CHECK (
      is_active = FALSE
      OR is_validated = TRUE
    )
);

COMMENT ON TABLE sim_wallet_balance_definitions IS
  'Fail-closed provider and SIM-role balance capabilities. A balance is exposed only after its real provider semantics have been validated.';


-- ============================================================
-- 4. GENERIC ROLE-SPECIFIC BALANCE ACCOUNTS
-- ============================================================
--
-- No rows are created here.
--
-- Existing Agent balances remain in their proven columns until a later
-- controlled cutover. Merchant, MTN EVD, Subscriber, and future
-- provider-specific balances can use these accounts once validated.
-- ============================================================

CREATE TABLE sim_wallet_balance_accounts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sim_wallet_id         UUID NOT NULL
                        REFERENCES agent_sim_wallets(id)
                        ON DELETE CASCADE,
  balance_code          VARCHAR(64) NOT NULL,
  current_balance       DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  low_balance_threshold DECIMAL(15, 2),
  last_updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (
    sim_wallet_id,
    balance_code
  ),

  CONSTRAINT chk_sim_wallet_balance_account_code
    CHECK (
      balance_code ~ '^[a-z][a-z0-9_]{0,63}$'
    ),

  CONSTRAINT chk_sim_wallet_balance_account_nonnegative
    CHECK (
      current_balance >= 0
    ),

  CONSTRAINT chk_sim_wallet_balance_account_threshold
    CHECK (
      low_balance_threshold IS NULL
      OR low_balance_threshold >= 0
    )
);

CREATE INDEX idx_sim_wallet_balance_accounts_wallet
ON sim_wallet_balance_accounts(sim_wallet_id);

COMMENT ON TABLE sim_wallet_balance_accounts IS
  'Generic electronic balance accounts attached to one role-scoped physical SIM wallet. No balance semantics are inferred merely from provider or SIM role.';


-- ============================================================
-- 5. GENERIC ROLE-SPECIFIC BALANCE MOVEMENT LEDGER
-- ============================================================
--
-- This ledger is intentionally separate from the proven legacy Agent
-- movement model. It will be used only when a role-specific balance
-- capability is validated and activated.
-- ============================================================

CREATE TABLE sim_wallet_balance_movements (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  balance_account_id UUID NOT NULL
                     REFERENCES sim_wallet_balance_accounts(id),
  transaction_id     UUID REFERENCES transactions(id),
  movement_code      VARCHAR(64) NOT NULL,
  amount_delta       DECIMAL(15, 2) NOT NULL,
  closing_balance    DECIMAL(15, 2) NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_sim_wallet_balance_movement_code
    CHECK (
      movement_code ~ '^[a-z][a-z0-9_]{0,63}$'
    ),

  CONSTRAINT chk_sim_wallet_balance_movement_delta
    CHECK (
      amount_delta <> 0
    ),

  CONSTRAINT chk_sim_wallet_balance_movement_closing
    CHECK (
      closing_balance >= 0
    )
);

CREATE INDEX idx_sim_wallet_balance_movements_account
ON sim_wallet_balance_movements (
  balance_account_id,
  created_at DESC
);

CREATE INDEX idx_sim_wallet_balance_movements_transaction
ON sim_wallet_balance_movements(transaction_id)
WHERE transaction_id IS NOT NULL;

COMMENT ON TABLE sim_wallet_balance_movements IS
  'Immutable movement history for validated generic role-specific SIM balances. Existing Agent ledger history remains unchanged.';


-- ============================================================
-- 6. NO BALANCE FABRICATION
-- ============================================================
--
-- Deliberately no INSERT into:
--
--   sim_wallet_balance_definitions
--   sim_wallet_balance_accounts
--   sim_wallet_balance_movements
--
-- Merchant and EVD balances remain unavailable until real provider
-- behavior is validated.
--
-- Existing Agent electronic balances remain untouched.
-- ============================================================
