'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '../../migrations/075_seed_mtn_personal_send_money_same_network_flow.sql'
);

const sql = fs.readFileSync(migrationPath, 'utf8');

describe('MTN Personal Send Money same-network flow', () => {
  test('uses the confirmed *170# Transfer Money path', () => {
    expect(sql).toContain("'send_money_same_network'");
    expect(sql).toContain("'*170#'");
    expect(sql).toContain(
      "(1, ARRAY['transfer money'],       'send_digit',          '1')"
    );
  });

  test('submits the recipient number exactly twice', () => {
    const matches =
      sql.match(/'send_customer_phone'/g) || [];

    expect(matches).toHaveLength(2);

    expect(sql).toContain(
      "(2, ARRAY['enter mobile number'], 'send_customer_phone', NULL)"
    );

    expect(sql).toContain(
      "(3, ARRAY['confirm number'],      'send_customer_phone', NULL)"
    );
  });

  test('sends amount and reference then stops at manual PIN', () => {
    expect(sql).toContain(
      "(4, ARRAY['enter amount'],        'send_amount',         NULL)"
    );

    expect(sql).toContain(
      "(5, ARRAY['enter reference'],     'send_reference',      NULL)"
    );

    expect(sql).toContain(
      "(6, ARRAY['enter mm pin'],        'pin_prompt',          NULL)"
    );
  });

  test('uses only observed success wording', () => {
    expect(sql).toContain(
      "ARRAY['you have sent ghs']"
    );

    expect(sql).toContain(
      'ARRAY[]::TEXT[]'
    );
  });

  test('never auto-approves a post-PIN MoMo Boost choice', () => {
    expect(sql).not.toContain("'auto_confirm_once'");
  });
});
