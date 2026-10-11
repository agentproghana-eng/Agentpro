'use strict';

const fs = require('fs');
const path = require('path');

const read = (file) =>
  fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');

const enumSql = read('migrations/165_add_allow_cash_out_transaction_type.sql');
const flowSql = read('migrations/166_seed_mtn_personal_allow_cash_out_flow.sql');
const routes = read('src/routes/personalTransaction.routes.js');
const controller = read('src/controllers/personalUssdFlowController.js');

describe('MTN Personal Allow Cash Out', () => {
  test('adds the enum value in its own migration', () => {
    expect(enumSql).toMatch(
      /ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'allow_cash_out'/
    );
    expect(flowSql).not.toMatch(/ALTER TYPE/);
  });

  test('is a true Global MTN flow on *170#', () => {
    expect(flowSql).toContain("'mtn'");
    expect(flowSql).toContain("'allow_cash_out'");
    expect(flowSql).toContain("'*170#'");
    expect(flowSql).toMatch(/company_id\s+IS\s+NULL/i);
    expect(flowSql).toMatch(/owner_user_id\s+IS\s+NULL/i);
  });

  test('routes 4 (Allow Cash Out) then 1 (Yes) with no PIN or inputs', () => {
    expect(flowSql).toContain("'allow cash out'");
    expect(flowSql).toContain("'1) yes'");
    expect(flowSql).toContain("'2) no'");
    expect(flowSql).toMatch(/'send_digit',\s*'4'/);
    expect(flowSql).toMatch(/'send_digit',\s*'1'/);
    expect(flowSql).not.toMatch(
      /pin_prompt|send_amount|send_customer_phone|send_reference/
    );
  });

  test('uses the live success message', () => {
    expect(flowSql).toContain("'cash out is allowed'");
  });

  test('registers the Personal capability', () => {
    expect(flowSql).toMatch(
      /\('allow_cash_out',\s*'personal',\s*'Allow Cash Out',\s*TRUE\)/
    );
  });

  test('takes no amount', () => {
    expect(routes).toMatch(
      /NO_AMOUNT_PERSONAL_TYPES = new Set\(\[[^\]]*'allow_cash_out'/
    );
  });

  test('is trusted PIN-less only for the exact two-digit flow', () => {
    expect(controller).toContain("flow.transaction_type === 'allow_cash_out'");
    expect(controller).toContain("flow.dial_code === '*170#'");
    expect(controller).toContain("steps[0]?.action_value === '4'");
    expect(controller).toContain("steps[1]?.action_value === '1'");
  });
});
