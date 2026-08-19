'use strict';

const fs = require('fs');
const path = require('path');

describe('MTN Global Business Quick Action repair migration', () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      '../../migrations/088_repair_missing_mtn_global_business_flows.sql'
    ),
    'utf8'
  );

  test('requires a superuser before repairing Global flows', () => {
    expect(migration).toContain(
      'Cannot repair MTN Global Business flows: no superuser exists'
    );
  });

  test('repairs the approved MTN Business catalog set', () => {
    const expected = [
      'send_money',
      'cash_out',
      'airtime',
      'data_bundle',
      'commission_balance',
      'cash_in_commission',
      'commission_transfer',
      'balance_enquiry',
    ];

    for (const transactionType of expected) {
      expect(migration).toContain(`'${transactionType}'`);
    }
  });

  test('does not expose unverified Pay to Agent or Merchant flows', () => {
    expect(migration).not.toMatch(
      /SELECT\s+'mtn',\s*'bill_payment'/i
    );

    expect(migration).not.toMatch(
      /SELECT\s+'mtn',\s*'merchant_payment'/i
    );
  });

  test('does not seed AT Money automation', () => {
    expect(migration).not.toMatch(
      /SELECT\s+'at_money'/i
    );
  });

  test('targets true-Global flow ownership', () => {
    expect(migration).toContain(
      'company_id IS NULL'
    );

    expect(migration).toContain(
      'owner_user_id IS NULL'
    );
  });

  test('keeps every automated MTN flow on the manual PIN boundary', () => {
    expect(migration).toContain(
      "'pin_prompt'"
    );

    expect(migration).not.toMatch(
      /send_pin|pin_value|momo_pin/i
    );
  });

  test('does not disable the legacy MTN Balance Enquiry template', () => {
    expect(migration).not.toMatch(
      /UPDATE\s+ussd_templates/i
    );
  });
});
