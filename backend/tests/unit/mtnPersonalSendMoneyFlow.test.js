'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '../../migrations/079_fix_mtn_personal_send_money_complete_menu_sequence.sql'
);

const sql = fs.readFileSync(migrationPath, 'utf8');

describe('MTN Personal Send Money same-network flow', () => {
  test('uses Transfer Money before MoMo User', () => {
    expect(sql).toContain(
      "ARRAY['transfer money']"
    );

    expect(sql).toContain(
      "'send_digit',\n        '1'"
    );

    expect(sql).toContain("'momo user'");
    expect(sql).toContain("'other networks'");
    expect(sql).toContain("'bank account'");
  });

  test('submits the recipient number twice', () => {
    expect(sql).toContain(
      "ARRAY['enter mobile number']"
    );

    expect(sql).toContain(
      "ARRAY['confirm number']"
    );
  });

  test('sends amount and reference then stops at PIN', () => {
    expect(sql).toContain(
      "ARRAY['enter amount']"
    );

    expect(sql).toContain(
      "ARRAY['enter reference']"
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

  test('requires exactly one active Global same-network flow', () => {
    expect(sql).toContain(
      'IF same_network_count <> 1 THEN'
    );

    expect(sql).toContain(
      'RAISE EXCEPTION'
    );
  });
});
