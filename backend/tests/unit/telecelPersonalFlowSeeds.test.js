'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '../../migrations/107_seed_telecel_personal_flows.sql'
);

const routePath = path.join(
  __dirname,
  '../../src/routes/personalTransaction.routes.js'
);

const sql = fs.readFileSync(migrationPath, 'utf8');
const route = fs.readFileSync(routePath, 'utf8');

describe('Telecel Personal recovered USSD flows', () => {
  test('contains only the recovered Personal transaction families', () => {
    expect(sql).toContain("'send_money_same_network'");
    expect(sql).toContain("'withdraw_cash'");
    expect(sql).toContain("'buy_airtime'");
    expect(sql).toContain("'buy_data'");

    expect(sql).not.toContain("'send_money_cross_network'");
    expect(sql).not.toContain("'check_momo_balance'");
    expect(sql).not.toContain("'check_airtime_balance'");
    expect(sql).not.toContain("'send_operator_id'");
  });

  test('keeps every recovered flow on Telecel *110#', () => {
    expect(sql).toContain("'telecel'");
    expect(sql).toContain("'*110#'");
  });

  test('restores same-network Send Money through reference and PIN', () => {
    expect(sql).toContain("ARRAY['mahitti promo']");
    expect(sql).toContain(
      "ARRAY['telecel cash user', 'cross border pay']"
    );
    expect(sql).toContain(
      "ARRAY['enter recipient phone number']"
    );
    expect(sql).toContain(
      "ARRAY['re-enter recipient number']"
    );
    expect(sql).toContain("ARRAY['enter reference']");
    expect(sql).toContain(
      "'send_reference'::ussd_flow_action"
    );
    expect(sql).toContain(
      "'pin_prompt'::ussd_flow_action"
    );
  });

  test('requires a reference for Telecel same-network Send Money', () => {
    expect(route).toContain(
      "payload?.provider === 'telecel'"
    );
    expect(route).toContain(
      "payload?.transaction_type === 'send_money_same_network'"
    );
    expect(route).toContain(
      'Reference is required for this Send Money transaction'
    );
  });

  test('restores Withdraw Cash with the till number twice', () => {
    expect(sql).toContain("ARRAY['enter till no']");
    expect(sql).toContain(
      "ARRAY['re-enter till number']"
    );

    const merchantActions =
      sql.match(/'send_merchant_id'::ussd_flow_action/g) || [];

    expect(merchantActions.length).toBeGreaterThanOrEqual(2);
  });

  test('restores only the recovered Telecel airtime recipient path', () => {
    expect(sql).toContain(
      "ARRAY['my phone', 'other telecel number']"
    );
    expect(sql).toContain(
      "ARRAY['to enter recipient number', 'my list']"
    );
  });

  test('restores exactly Daily Self and Daily Other data identities', () => {
    expect(sql).toContain(
      "COALESCE(bundle_category, '') = 'daily'"
    );
    expect(sql).toContain(
      "COALESCE(recipient_mode, '') = 'self'"
    );
    expect(sql).toContain(
      "COALESCE(recipient_mode, '') = 'other'"
    );

    expect(sql).not.toContain(
      "COALESCE(bundle_category, '') = 'weekly'"
    );
    expect(sql).not.toContain(
      "COALESCE(bundle_category, '') = 'monthly'"
    );
    expect(sql).not.toContain(
      "COALESCE(bundle_category, '') = 'night'"
    );
    expect(sql).not.toContain(
      "COALESCE(bundle_category, '') = 'flexi'"
    );
  });

  test('keeps PIN entry manual', () => {
    expect(sql).not.toContain("'auto_confirm_once'");
    expect(sql).toContain("'interactive'");
  });
});
