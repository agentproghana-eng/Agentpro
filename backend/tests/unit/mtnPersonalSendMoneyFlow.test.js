'use strict';

const fs = require('fs');
const path = require('path');

const seedMigrationPath = path.join(
  __dirname,
  '../../migrations/075_seed_mtn_personal_send_money_same_network_flow.sql'
);

const correctionMigrationPath = path.join(
  __dirname,
  '../../migrations/078_fix_mtn_personal_send_money_same_network_current_menu.sql'
);

const seedSql = fs.readFileSync(seedMigrationPath, 'utf8');
const correctionSql = fs.readFileSync(correctionMigrationPath, 'utf8');

describe('MTN Personal Send Money same-network flow', () => {
  test('corrects the first step for the current *170# menu', () => {
    expect(seedSql).toContain("'send_money_same_network'");
    expect(seedSql).toContain("'*170#'");

    expect(correctionSql).toContain("'momo user'");
    expect(correctionSql).toContain("'other networks'");
    expect(correctionSql).toContain("'bank account'");

    expect(correctionSql).toContain(
      "s.action::TEXT = 'send_digit'"
    );

    expect(correctionSql).toContain(
      "s.action_value = '1'"
    );
  });

  test('submits the recipient number exactly twice', () => {
    const matches =
      seedSql.match(/'send_customer_phone'/g) || [];

    expect(matches).toHaveLength(2);

    expect(seedSql).toContain(
      "(2, ARRAY['enter mobile number'], 'send_customer_phone', NULL)"
    );

    expect(seedSql).toContain(
      "(3, ARRAY['confirm number'],      'send_customer_phone', NULL)"
    );
  });

  test('sends amount and reference then stops at manual PIN', () => {
    expect(seedSql).toContain(
      "(4, ARRAY['enter amount'],        'send_amount',         NULL)"
    );

    expect(seedSql).toContain(
      "(5, ARRAY['enter reference'],     'send_reference',      NULL)"
    );

    expect(seedSql).toContain(
      "(6, ARRAY['enter mm pin'],        'pin_prompt',          NULL)"
    );
  });

  test('keeps observed receipt wording and no automatic post-PIN decision', () => {
    expect(seedSql).toContain(
      "ARRAY['you have sent ghs']"
    );

    expect(seedSql).toContain(
      'ARRAY[]::TEXT[]'
    );

    expect(seedSql).not.toContain(
      "'auto_confirm_once'"
    );

    expect(correctionSql).not.toContain(
      "'auto_confirm_once'"
    );
  });

  test('fails loudly unless exactly one global first step is corrected', () => {
    expect(correctionSql).toContain(
      'IF updated_steps <> 1 THEN'
    );

    expect(correctionSql).toContain(
      'RAISE EXCEPTION'
    );
  });
});
