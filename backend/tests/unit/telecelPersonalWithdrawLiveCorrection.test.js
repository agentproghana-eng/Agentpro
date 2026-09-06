'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '../../migrations/108_correct_telecel_personal_withdraw_order.sql'
);

const sql = fs.readFileSync(migrationPath, 'utf8');

function expectInOrder(...needles) {
  let previousIndex = -1;

  for (const needle of needles) {
    const index = sql.indexOf(needle);

    expect(index).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}

describe('Telecel Personal Withdraw live-order correction', () => {
  test('targets only the existing Global Personal Telecel withdrawal', () => {
    expect(sql).toContain("provider = 'telecel'");
    expect(sql).toContain("transaction_type = 'withdraw_cash'");
    expect(sql).toContain('company_id IS NULL');
    expect(sql).toContain('owner_user_id IS NULL');
    expect(sql).toContain('business_sim_role IS NULL');

    expect(sql).not.toContain("'send_operator_id'");
    expect(sql).not.toContain("'send_money_same_network'");
    expect(sql).not.toContain("'send_money_cross_network'");
    expect(sql).not.toContain("'buy_airtime'");
    expect(sql).not.toContain("'buy_data'");
  });

  test('fails closed instead of creating a replacement flow', () => {
    expect(sql).toContain('IF v_flow_id IS NULL THEN');
    expect(sql).toContain('RAISE EXCEPTION');

    expect(sql).not.toContain('INSERT INTO ussd_flows');
  });

  test('matches the live Telecel Withdraw Cash order', () => {
    expectInOrder(
      "ARRAY['mahitti promo']",
      "ARRAY['withdraw cash', 'from atm']",
      "ARRAY['enter till no']",
      "ARRAY['re-enter till number']",
      "ARRAY['enter amount']",
      "ARRAY['enter pin']"
    );
  });

  test('enters the till twice before the amount', () => {
    const merchantActions =
      sql.match(/'send_merchant_id'::ussd_flow_action/g) || [];

    const amountActions =
      sql.match(/'send_amount'::ussd_flow_action/g) || [];

    expect(merchantActions).toHaveLength(2);
    expect(amountActions).toHaveLength(1);

    expect(
      sql.indexOf("ARRAY['re-enter till number']")
    ).toBeLessThan(
      sql.indexOf("ARRAY['enter amount']")
    );
  });

  test('stops automation at PIN', () => {
    const pinActions =
      sql.match(/'pin_prompt'::ussd_flow_action/g) || [];

    expect(pinActions).toHaveLength(1);
    expect(sql).not.toContain("'auto_confirm_once'");
  });
});
