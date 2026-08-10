-- ============================================================
-- 068: Telecel Working Account per-SIM balance
-- ============================================================
--
-- Telecel Agent SIM electronic balances:
--
--   Working Account -> working_balance
--   Float           -> e_float_balance
--   Commission      -> commission_balance
--
-- Working Account is electronic value belonging to the agent
-- business but is separate from operational Float.
--
-- Existing wallets start at ZERO working balance because AgentPro
-- has never historically tracked Telecel Working Account separately.
-- We must not infer or redistribute historical e-Float into it.
--
-- working_balance remains SIM-scoped, just like e-Float and
-- commission. It is never a physical-cash or branch-treasury target.

ALTER TABLE agent_sim_wallets
ADD COLUMN working_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00;


COMMENT ON COLUMN agent_sim_wallets.working_balance IS
  'Telecel Agent Working Account electronic balance. Separate from operational e-Float and commission; zero for historical wallets unless explicitly observed or posted.';


-- The foundation migration originally permits SIM-wallet movements
-- only for e_float and commission. Working Account is a third
-- electronic balance on the same exact SIM wallet.
ALTER TABLE agent_balance_movements
DROP CONSTRAINT chk_agent_balance_movement_target;


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
    balance_type IN (
      'e_float',
      'working_balance',
      'commission'
    )
    AND provider IS NOT NULL
    AND sim_wallet_id IS NOT NULL
    AND cash_balance_id IS NULL
  )
);


COMMENT ON TABLE agent_sim_wallets IS
  'Electronic wallets for agent e-Float, Telecel Working Account, and commission, separated by physical or unresolved SIM identity.';


COMMENT ON COLUMN agent_balance_movements.sim_wallet_id IS
  'Financial target for e-Float, Working Account, or commission movements. Historical rows remain attached to legacy_unassigned wallets until explicit reconciliation.';
