'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '../../migrations/077_seed_mtn_personal_send_money_cross_network_flow.sql'
);

const sql = fs.readFileSync(migrationPath, 'utf8');

describe('MTN Personal Send Money other-network flow', () => {
  test('uses the confirmed *170# Transfer Money -> Other Networks path', () => {
    expect(sql).toContain("'send_money_cross_network'");
    expect(sql).toContain("'*170#'");

    expect(sql).toContain(
      "ARRAY['transfer money']"
    );

    expect(sql).toContain(
      "'send_digit',"
    );

    expect(sql).toContain(
      "'1'"
    );

    expect(sql).toContain(
      "ARRAY['other networks']"
    );

    expect(sql).toContain(
      "'5'"
    );
  });

  test('uses dynamic recipient-network selection', () => {
    expect(sql).toContain(
      "'send_selection'"
    );

    expect(sql).toContain(
      "'transfer money to other network'"
    );

    expect(sql).toContain("'telecel'");
    expect(sql).toContain("'ghanapay'");
  });

  test('submits and confirms recipient phone', () => {
    const phoneActions =
      sql.match(/'send_customer_phone'/g) || [];

    expect(phoneActions).toHaveLength(2);

    expect(sql).toContain(
      "ARRAY['enter mobile number']"
    );

    expect(sql).toContain(
      "ARRAY['confirm mobile number']"
    );
  });

  test('sends amount and required reference before manual PIN', () => {
    expect(sql).toContain(
      "ARRAY['enter amount to transfer']"
    );

    expect(sql).toContain(
      "'send_amount'"
    );

    expect(sql).toContain(
      "ARRAY['enter reference id']"
    );

    expect(sql).toContain(
      "'send_reference'"
    );

    expect(sql).toContain(
      "ARRAY['enter mm pin']"
    );

    expect(sql).toContain(
      "'pin_prompt'"
    );
  });

  test('does not guess receipt markers or post-PIN confirmation', () => {
    const emptyMarkers =
      sql.match(/ARRAY\[\]::TEXT\[\]/g) || [];

    expect(emptyMarkers.length).toBeGreaterThanOrEqual(2);

    expect(sql).not.toContain(
      "'auto_confirm_once'"
    );
  });

  test('fails loudly instead of silently applying without a superuser', () => {
    expect(sql).toContain(
      'Cannot seed MTN Personal cross-network USSD flow: no superuser exists'
    );

    expect(sql).toContain('RAISE EXCEPTION');

    expect(sql).not.toContain(
      "AND EXISTS (\n  SELECT 1\n  FROM users\n  WHERE role = 'superuser'\n)"
    );
  });


});
