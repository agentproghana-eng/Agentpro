-- P1 commercial hardening: database-level financial invariants.
--
-- These constraints intentionally protect universal accounting invariants
-- without duplicating transaction-type-specific application validation.
--
-- In particular, transactions.amount may legitimately be zero for
-- non-money operations such as balance/commission enquiries, while
-- personal_transactions.amount may also be NULL for no-amount/fixed-menu
-- operations. Negative transaction amounts are never valid.
--
-- Constraints are added NOT VALID first so PostgreSQL does not perform a
-- full table scan while holding the stronger ADD CONSTRAINT lock. They are
-- then validated separately.

ALTER TABLE transactions
  ADD CONSTRAINT chk_transactions_amount_nonnegative
  CHECK (amount >= 0)
  NOT VALID;

ALTER TABLE transactions
  ADD CONSTRAINT chk_transactions_fee_nonnegative
  CHECK (fee >= 0)
  NOT VALID;

ALTER TABLE personal_transactions
  ADD CONSTRAINT chk_personal_transactions_amount_nonnegative
  CHECK (amount IS NULL OR amount >= 0)
  NOT VALID;

ALTER TABLE agent_cash_balances
  ADD CONSTRAINT chk_agent_cash_balances_cash_nonnegative
  CHECK (cash_at_hand >= 0)
  NOT VALID;

ALTER TABLE agent_sim_wallets
  ADD CONSTRAINT chk_agent_sim_wallets_e_float_nonnegative
  CHECK (e_float_balance >= 0)
  NOT VALID;

ALTER TABLE agent_sim_wallets
  ADD CONSTRAINT chk_agent_sim_wallets_commission_nonnegative
  CHECK (commission_balance >= 0)
  NOT VALID;

ALTER TABLE agent_sim_wallets
  ADD CONSTRAINT chk_agent_sim_wallets_working_nonnegative
  CHECK (working_balance >= 0)
  NOT VALID;

ALTER TABLE agent_sim_wallets
  ADD CONSTRAINT chk_agent_sim_wallets_threshold_nonnegative
  CHECK (low_balance_threshold >= 0)
  NOT VALID;

ALTER TABLE agent_balances
  ADD CONSTRAINT chk_agent_balances_e_float_nonnegative
  CHECK (e_float_balance >= 0)
  NOT VALID;

ALTER TABLE agent_balances
  ADD CONSTRAINT chk_agent_balances_cash_nonnegative
  CHECK (cash_at_hand >= 0)
  NOT VALID;

ALTER TABLE agent_balances
  ADD CONSTRAINT chk_agent_balances_commission_nonnegative
  CHECK (commission_balance >= 0)
  NOT VALID;

ALTER TABLE agent_balances
  ADD CONSTRAINT chk_agent_balances_threshold_nonnegative
  CHECK (low_balance_threshold >= 0)
  NOT VALID;

ALTER TABLE agent_balance_movements
  ADD CONSTRAINT chk_agent_balance_movements_amount_positive
  CHECK (amount > 0)
  NOT VALID;

ALTER TABLE agent_balance_movements
  ADD CONSTRAINT chk_agent_balance_movements_before_nonnegative
  CHECK (balance_before >= 0)
  NOT VALID;

ALTER TABLE agent_balance_movements
  ADD CONSTRAINT chk_agent_balance_movements_after_nonnegative
  CHECK (balance_after >= 0)
  NOT VALID;

ALTER TABLE float_accounts
  ADD CONSTRAINT chk_float_accounts_balance_nonnegative
  CHECK (current_balance >= 0)
  NOT VALID;

ALTER TABLE float_accounts
  ADD CONSTRAINT chk_float_accounts_threshold_nonnegative
  CHECK (low_balance_threshold >= 0)
  NOT VALID;

ALTER TABLE float_movements
  ADD CONSTRAINT chk_float_movements_amount_positive
  CHECK (amount > 0)
  NOT VALID;

ALTER TABLE float_movements
  ADD CONSTRAINT chk_float_movements_before_nonnegative
  CHECK (balance_before >= 0)
  NOT VALID;

ALTER TABLE float_movements
  ADD CONSTRAINT chk_float_movements_after_nonnegative
  CHECK (balance_after >= 0)
  NOT VALID;

ALTER TABLE float_requests
  ADD CONSTRAINT chk_float_requests_amount_positive
  CHECK (amount_requested > 0)
  NOT VALID;

ALTER TABLE commission_rules
  ADD CONSTRAINT chk_commission_rules_rate_percent_range
  CHECK (rate_percent >= 0 AND rate_percent <= 1)
  NOT VALID;

ALTER TABLE commission_rules
  ADD CONSTRAINT chk_commission_rules_provider_share_range
  CHECK (
    provider_share_percent >= 0
    AND provider_share_percent <= 1
  )
  NOT VALID;

ALTER TABLE commission_rules
  ADD CONSTRAINT chk_commission_rules_threshold_nonnegative
  CHECK (
    threshold_amount IS NULL
    OR threshold_amount >= 0
  )
  NOT VALID;

ALTER TABLE commission_rules
  ADD CONSTRAINT chk_commission_rules_cap_nonnegative
  CHECK (
    cap_amount IS NULL
    OR cap_amount >= 0
  )
  NOT VALID;

ALTER TABLE commissions
  ADD CONSTRAINT chk_commissions_gross_nonnegative
  CHECK (gross_commission >= 0)
  NOT VALID;

ALTER TABLE commissions
  ADD CONSTRAINT chk_commissions_provider_share_nonnegative
  CHECK (provider_share >= 0)
  NOT VALID;

ALTER TABLE commissions
  ADD CONSTRAINT chk_commissions_net_nonnegative
  CHECK (net_commission >= 0)
  NOT VALID;

ALTER TABLE commissions
  ADD CONSTRAINT chk_commissions_parts_match_gross
  CHECK (
    provider_share + net_commission = gross_commission
  )
  NOT VALID;

ALTER TABLE transactions
  VALIDATE CONSTRAINT chk_transactions_amount_nonnegative;

ALTER TABLE transactions
  VALIDATE CONSTRAINT chk_transactions_fee_nonnegative;

ALTER TABLE personal_transactions
  VALIDATE CONSTRAINT chk_personal_transactions_amount_nonnegative;

ALTER TABLE agent_cash_balances
  VALIDATE CONSTRAINT chk_agent_cash_balances_cash_nonnegative;

ALTER TABLE agent_sim_wallets
  VALIDATE CONSTRAINT chk_agent_sim_wallets_e_float_nonnegative;

ALTER TABLE agent_sim_wallets
  VALIDATE CONSTRAINT chk_agent_sim_wallets_commission_nonnegative;

ALTER TABLE agent_sim_wallets
  VALIDATE CONSTRAINT chk_agent_sim_wallets_working_nonnegative;

ALTER TABLE agent_sim_wallets
  VALIDATE CONSTRAINT chk_agent_sim_wallets_threshold_nonnegative;

ALTER TABLE agent_balances
  VALIDATE CONSTRAINT chk_agent_balances_e_float_nonnegative;

ALTER TABLE agent_balances
  VALIDATE CONSTRAINT chk_agent_balances_cash_nonnegative;

ALTER TABLE agent_balances
  VALIDATE CONSTRAINT chk_agent_balances_commission_nonnegative;

ALTER TABLE agent_balances
  VALIDATE CONSTRAINT chk_agent_balances_threshold_nonnegative;

ALTER TABLE agent_balance_movements
  VALIDATE CONSTRAINT chk_agent_balance_movements_amount_positive;

ALTER TABLE agent_balance_movements
  VALIDATE CONSTRAINT chk_agent_balance_movements_before_nonnegative;

ALTER TABLE agent_balance_movements
  VALIDATE CONSTRAINT chk_agent_balance_movements_after_nonnegative;

ALTER TABLE float_accounts
  VALIDATE CONSTRAINT chk_float_accounts_balance_nonnegative;

ALTER TABLE float_accounts
  VALIDATE CONSTRAINT chk_float_accounts_threshold_nonnegative;

ALTER TABLE float_movements
  VALIDATE CONSTRAINT chk_float_movements_amount_positive;

ALTER TABLE float_movements
  VALIDATE CONSTRAINT chk_float_movements_before_nonnegative;

ALTER TABLE float_movements
  VALIDATE CONSTRAINT chk_float_movements_after_nonnegative;

ALTER TABLE float_requests
  VALIDATE CONSTRAINT chk_float_requests_amount_positive;

ALTER TABLE commission_rules
  VALIDATE CONSTRAINT chk_commission_rules_rate_percent_range;

ALTER TABLE commission_rules
  VALIDATE CONSTRAINT chk_commission_rules_provider_share_range;

ALTER TABLE commission_rules
  VALIDATE CONSTRAINT chk_commission_rules_threshold_nonnegative;

ALTER TABLE commission_rules
  VALIDATE CONSTRAINT chk_commission_rules_cap_nonnegative;

ALTER TABLE commissions
  VALIDATE CONSTRAINT chk_commissions_gross_nonnegative;

ALTER TABLE commissions
  VALIDATE CONSTRAINT chk_commissions_provider_share_nonnegative;

ALTER TABLE commissions
  VALIDATE CONSTRAINT chk_commissions_net_nonnegative;

ALTER TABLE commissions
  VALIDATE CONSTRAINT chk_commissions_parts_match_gross;
