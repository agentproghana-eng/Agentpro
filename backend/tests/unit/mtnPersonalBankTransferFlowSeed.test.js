'use strict';

const fs = require('fs');
const path = require('path');

const read = (file) =>
  fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');

const sql = read('migrations/168_seed_mtn_personal_send_money_to_bank_flow.sql');
const routes = read('src/routes/personalTransaction.routes.js');

describe('MTN Personal Send Money to Bank', () => {
  test('is a Global MTN flow on *170# reusing the existing type', () => {
    expect(sql).toContain("'mtn'");
    expect(sql).toContain("'send_money_to_bank'");
    expect(sql).toContain("'*170#'");
    expect(sql).toMatch(/company_id\s+IS\s+NULL/i);
    expect(sql).toMatch(/owner_user_id\s+IS\s+NULL/i);
    expect(sql).not.toMatch(/ALTER TYPE/);
  });

  test('walks 1 -> 6 -> 1 then one bank selection step', () => {
    expect(sql).toMatch(/'allow cash out'\][^)]*'send_digit'::ussd_flow_action, '1'/s);
    expect(sql).toMatch(/'bank account'\][^)]*'send_digit'::ussd_flow_action, '6'/s);
    expect(sql).toMatch(/'wallet to bank account'\][^)]*'send_digit'::ussd_flow_action, '1'/s);
    expect((sql.match(/'send_selection'::ussd_flow_action/g) || []).length).toBe(1);
    expect(sql).not.toContain("'#'");
  });

  test('sends the account number to both prompts, then amount and reference', () => {
    expect((sql.match(/'send_account_number'::ussd_flow_action/g) || []).length).toBe(2);
    expect(sql).toContain("'enter bank account number'");
    expect(sql).toContain("'confirm bank account number'");
    expect(sql).toContain("'enter amount to transfer'");
    expect(sql).toContain("'enter reference id'");
  });

  test('stops at the PIN screen with nothing after it', () => {
    const pinIndex = sql.indexOf("'pin_prompt'::ussd_flow_action");
    expect(pinIndex).toBeGreaterThan(0);
    expect(sql.slice(pinIndex)).not.toMatch(/send_digit|auto_confirm_once/);
  });

  test('validates bank routing against the selected MTN bank', () => {
    expect(routes).toContain('MTN_PERSONAL_BANKS');
    expect(routes).toContain('isMtnBankTransfer');
    expect(routes).toContain('Bank routing selections do not match the selected MTN bank');
  });
});
