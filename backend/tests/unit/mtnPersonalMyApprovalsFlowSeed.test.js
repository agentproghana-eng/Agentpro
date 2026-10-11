'use strict';

const fs = require('fs');
const path = require('path');

const read = (file) =>
  fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');

const enumSql = read('migrations/165_add_allow_cash_out_transaction_type.sql');
const sql = read('migrations/167_seed_mtn_personal_my_approvals_flow.sql');
const routes = read('src/routes/personalTransaction.routes.js');

describe('MTN Personal My Approvals', () => {
  test('adds the enum value before the flow is seeded', () => {
    expect(enumSql).toContain("ADD VALUE IF NOT EXISTS 'my_approvals'");
    expect(sql).not.toMatch(/ALTER TYPE/);
  });

  test('is a true Global MTN flow on *170#', () => {
    expect(sql).toContain("'my_approvals'");
    expect(sql).toContain("'*170#'");
    expect(sql).toMatch(/company_id\s+IS\s+NULL/i);
    expect(sql).toMatch(/owner_user_id\s+IS\s+NULL/i);
  });

  test('routes 6 -> 3 -> 1 and stops at the manual PIN boundary', () => {
    expect(sql).toMatch(/'send_digit',\s*'6'/);
    expect(sql).toMatch(/'send_digit',\s*'3'/);
    expect(sql).toMatch(/'send_digit',\s*'1'/);
    expect(sql).toContain("'preapprovals'");
    expect(sql).toContain("'enter pin'");
    expect(sql).toContain("'pin_prompt'");

    // Nothing may be sent after the PIN prompt.
    expect(sql).not.toMatch(
      /pin_prompt[\s\S]{0,200}(send_digit|send_literal|send_amount)/i
    );
  });

  test('success marker cannot match the PIN screen itself', () => {
    expect(sql).toContain("'no pending approvals'");
    const markers = sql.match(/ARRAY\[\s*'no pending approvals'\s*\]/);
    expect(markers).not.toBeNull();
  });

  test('registers the capability and takes no amount', () => {
    expect(sql).toMatch(
      /\('my_approvals',\s*'personal',\s*'My Approvals',\s*TRUE\)/
    );
    expect(routes).toMatch(
      /NO_AMOUNT_PERSONAL_TYPES = new Set\(\[[^\]]*'my_approvals'/
    );
  });
});
