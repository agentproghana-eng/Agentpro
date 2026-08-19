'use strict';

const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(
    __dirname,
    '../../migrations/087_seed_mtn_personal_balance_flows.sql'
  ),
  'utf8'
);

describe('MTN Personal balance global flow seeds', () => {
  test('seeds both Personal balance transaction types', () => {
    expect(sql).toContain("'check_momo_balance'");
    expect(sql).toContain("'check_airtime_balance'");
  });

  test('both seeds are true Global flows', () => {
    expect(sql).toMatch(/company_id\s+IS\s+NULL/i);
    expect(sql).toMatch(/owner_user_id\s+IS\s+NULL/i);
  });

  test('MoMo balance uses verified *170# routing', () => {
    expect(sql).toContain("'*170#'");
    expect(sql).toContain("'transfer money'");
    expect(sql).toContain("'momopay&pay bill'");
    expect(sql).toContain("'airtime&bundles'");
    expect(sql).toContain("'allow cash out'");
    expect(sql).toContain("'6'");

    expect(sql).toContain("'check balance'");
    expect(sql).toContain("'my approvals'");
    expect(sql).toContain("'statements'");
    expect(sql).toContain("'1'");
  });

  test('MoMo balance stops at manual PIN boundary', () => {
    expect(sql).toContain("'fee is ghs'");
    expect(sql).toContain("'enter mm pin'");
    expect(sql).toContain("'pin_prompt'");

    expect(sql).not.toMatch(
      /pin_prompt[\s\S]{0,150}(send_digit|send_literal)/i
    );
  });

  test('MoMo success markers match verified result', () => {
    expect(sql).toContain("'current balance'");
    expect(sql).toContain("'available balance'");
  });

  test('Pulse balance uses verified *567# routing', () => {
    expect(sql).toContain("'*567#'");
    expect(sql).toContain("'proceed to buy bundle'");
    expect(sql).toContain("'mashup for self'");
    expect(sql).toContain("'mashup for others'");
    expect(sql).toContain("'99. more'");
    expect(sql).toContain("'download app'");
    expect(sql).toContain("'7'");
  });

  test('Pulse balance uses verified terminal marker', () => {
    expect(sql).toContain("'your pulse balance'");
  });

  test('does not invent unverified failure markers', () => {
    expect(
      sql.match(/ARRAY\[\]::TEXT\[\]/g)
    ).toHaveLength(2);
  });
});
