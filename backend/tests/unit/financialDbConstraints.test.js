'use strict';

const fs = require('fs');
const path = require('path');

describe('financial database integrity constraints', () => {
  const migrationPath = path.join(
    __dirname,
    '../../migrations/090_financial_integrity_constraints.sql'
  );

  const sql = fs.readFileSync(migrationPath, 'utf8');

  const expectedConstraints = [
    'chk_transactions_amount_nonnegative',
    'chk_transactions_fee_nonnegative',
    'chk_personal_transactions_amount_nonnegative',
    'chk_agent_cash_balances_cash_nonnegative',
    'chk_agent_sim_wallets_e_float_nonnegative',
    'chk_agent_sim_wallets_commission_nonnegative',
    'chk_agent_sim_wallets_working_nonnegative',
    'chk_agent_sim_wallets_threshold_nonnegative',
    'chk_agent_balances_e_float_nonnegative',
    'chk_agent_balances_cash_nonnegative',
    'chk_agent_balances_commission_nonnegative',
    'chk_agent_balances_threshold_nonnegative',
    'chk_agent_balance_movements_amount_positive',
    'chk_agent_balance_movements_before_nonnegative',
    'chk_agent_balance_movements_after_nonnegative',
    'chk_float_accounts_balance_nonnegative',
    'chk_float_accounts_threshold_nonnegative',
    'chk_float_movements_amount_positive',
    'chk_float_movements_before_nonnegative',
    'chk_float_movements_after_nonnegative',
    'chk_float_requests_amount_positive',
    'chk_commission_rules_rate_percent_range',
    'chk_commission_rules_provider_share_range',
    'chk_commission_rules_threshold_nonnegative',
    'chk_commission_rules_cap_nonnegative',
    'chk_commissions_gross_nonnegative',
    'chk_commissions_provider_share_nonnegative',
    'chk_commissions_net_nonnegative',
    'chk_commissions_parts_match_gross',
  ];

  test('adds and validates every required financial constraint', () => {
    for (const constraint of expectedConstraints) {
      expect(sql).toContain(`CONSTRAINT ${constraint}`);
      expect(sql).toContain(`VALIDATE CONSTRAINT ${constraint}`);
    }
  });

  test('uses low-lock NOT VALID then VALIDATE deployment pattern', () => {
    const additions =
      sql.match(/^\s*ADD CONSTRAINT /gm) || [];
    const notValid =
      sql.match(/^\s*NOT VALID;/gm) || [];
    const validations =
      sql.match(/^\s*VALIDATE CONSTRAINT /gm) || [];

    expect(additions).toHaveLength(expectedConstraints.length);
    expect(notValid).toHaveLength(expectedConstraints.length);
    expect(validations).toHaveLength(expectedConstraints.length);
  });

  test('preserves legitimate zero and nullable transaction amounts', () => {
    expect(sql).toContain(
      'CONSTRAINT chk_transactions_amount_nonnegative'
    );
    expect(sql).toContain('CHECK (amount >= 0)');

    expect(sql).toContain(
      'CONSTRAINT chk_personal_transactions_amount_nonnegative'
    );
    expect(sql).toContain(
      'CHECK (amount IS NULL OR amount >= 0)'
    );
  });

  test('requires movement magnitudes to be strictly positive', () => {
    expect(sql).toContain(
      'CONSTRAINT chk_agent_balance_movements_amount_positive'
    );
    expect(sql).toContain(
      'CONSTRAINT chk_float_movements_amount_positive'
    );
    expect(sql).toContain(
      'CONSTRAINT chk_float_requests_amount_positive'
    );
  });

  test('bounds percentage-style commission values', () => {
    expect(sql).toContain(
      'CHECK (rate_percent >= 0 AND rate_percent <= 1)'
    );
    expect(sql).toContain(
      'provider_share_percent >= 0'
    );
    expect(sql).toContain(
      'provider_share_percent <= 1'
    );
  });

  test('requires commission parts to reconcile to gross', () => {
    expect(sql).toContain(
      'provider_share + net_commission = gross_commission'
    );
  });
});
