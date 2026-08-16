'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '../../migrations/079_fix_mtn_personal_send_money_complete_menu_sequence.sql'
);

const sql = fs.readFileSync(migrationPath, 'utf8');

describe('MTN Personal Send Money other-network flow', () => {
  test('uses Transfer Money before Other Networks', () => {
    expect(sql).toContain(
      "ARRAY['transfer money']"
    );

    expect(sql).toContain("'momo user'");
    expect(sql).toContain("'other networks'");
    expect(sql).toContain("'bank account'");

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
    expect(sql).toContain(
      "ARRAY['enter mobile number']"
    );

    expect(sql).toContain(
      "ARRAY['confirm mobile number']"
    );
  });

  test('sends amount and reference then stops at PIN', () => {
    expect(sql).toContain(
      "ARRAY['enter amount to transfer']"
    );

    expect(sql).toContain(
      "ARRAY['enter reference id']"
    );

    expect(sql).toContain(
      "ARRAY['enter mm pin']"
    );

    expect(sql).toContain(
      "'pin_prompt'"
    );
  });

  test('does not automate any post-PIN decision', () => {
    expect(sql).not.toContain(
      "'auto_confirm_once'"
    );
  });

  test('requires exactly one active Global cross-network flow', () => {
    expect(sql).toContain(
      'IF cross_network_count <> 1 THEN'
    );

    expect(sql).toContain(
      'RAISE EXCEPTION'
    );
  });
});
