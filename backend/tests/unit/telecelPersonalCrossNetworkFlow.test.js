'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '../../migrations/109_seed_telecel_personal_send_money_cross_network.sql'
);

const sql = fs.readFileSync(migrationPath, 'utf8');

function expectMarkersInOrder(...markers) {
  let previous = -1;

  for (const marker of markers) {
    const index = sql.indexOf(marker);

    expect(index).toBeGreaterThan(previous);
    previous = index;
  }
}

describe('Telecel Personal cross-network live USSD flow', () => {
  test('targets only Global Personal Telecel cross-network Send Money', () => {
    expect(sql).toContain("provider = 'telecel'");
    expect(sql).toContain(
      "transaction_type = 'send_money_cross_network'"
    );

    expect(sql).toContain('company_id IS NULL');
    expect(sql).toContain('owner_user_id IS NULL');
    expect(sql).toContain('business_sim_role IS NULL');

    expect(sql).toContain("'*110#'");
    expect(sql).toContain("'interactive'");
  });

  test('uses only the four live-confirmed destination networks', () => {
    for (const marker of [
      "'1 mtn'",
      "'2 atmoney'",
      "'3 g-money'",
      "'4 ghanapay'",
    ]) {
      expect(sql).toContain(marker);
    }

    expect(sql).not.toContain("'5 zeepay'");
  });

  test('matches the complete live pre-PIN sequence', () => {
    expectMarkersInOrder(
      "ARRAY[\n        'send money',\n        'mahitti promo'",
      "'telecel cash user'",
      "'please choose network'",
      "'10-digit'",
      "'enter recipient phone number again'",
      "'you have requested to send money to'",
      "ARRAY['enter amount']",
      "ARRAY['enter reference']",
      "ARRAY['enter pin']",
    );
  });

  test('automatically confirms the verified recipient-name screen', () => {
    expect(sql).toContain(
      "'you have requested to send money to'"
    );

    expect(sql).toContain("'1 confirm'");

    const recipientConfirmation =
      sql.indexOf("'you have requested to send money to'");

    const amount =
      sql.indexOf("ARRAY['enter amount']");

    expect(recipientConfirmation).toBeLessThan(amount);
  });

  test('uses dynamic network selection and enters the phone twice', () => {
    expect(
      sql.match(/'send_selection'::ussd_flow_action/g) || []
    ).toHaveLength(1);

    expect(
      sql.match(/'send_customer_phone'::ussd_flow_action/g) || []
    ).toHaveLength(2);
  });

  test('stops automation at the PIN boundary', () => {
    expect(
      sql.match(/'pin_prompt'::ussd_flow_action/g) || []
    ).toHaveLength(1);

    expect(sql).not.toContain("'auto_confirm_once'");
    expect(sql).not.toContain("'send_pin'");
  });

  test('does not introduce Agent or Business automation', () => {
    expect(sql).not.toContain("'send_operator_id'");
    expect(sql).not.toContain("'cash_in'");
    expect(sql).not.toContain("'cash_out'");
  });
});
