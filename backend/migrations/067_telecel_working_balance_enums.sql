-- ============================================================
-- 067: Telecel Working Account ledger enum values
-- ============================================================
--
-- Telecel Agent SIMs expose three separate electronic balances:
--
--   Working Account
--   Float
--   Commission
--
-- AgentPro already models:
--
--   Float       -> agent_sim_wallets.e_float_balance
--   Commission  -> agent_sim_wallets.commission_balance
--
-- Working Account will be added as a separate per-SIM balance in
-- the following migration.
--
-- Keep these enum additions separate because PostgreSQL enum values
-- must commit before a later migration uses them in constraints.
--
-- Accounting:
--
-- Working Account -> Float
--   working_balance  - amount
--   e_float          + amount
--
-- Float -> Working Account
--   e_float          - amount
--   working_balance  + amount
--
-- No physical cash movement.
-- No earned commission.
-- No branch treasury movement.

ALTER TYPE agent_balance_type
ADD VALUE IF NOT EXISTS 'working_balance';

ALTER TYPE agent_balance_movement_type
ADD VALUE IF NOT EXISTS 'working_to_float';

ALTER TYPE agent_balance_movement_type
ADD VALUE IF NOT EXISTS 'float_to_working';
