'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '../../migrations/145_correct_telecel_live_airtime_balance.sql',
);

const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase();

function expectMarkersInOrder(...markers) {
  let previous = -1;

  for (const marker of markers) {
    const index = sql.indexOf(marker);

    expect(index).toBeGreaterThan(previous);
    previous = index;
  }
}

describe('Telecel Global merchant live Airtime and Balance correction', () => {
  test('corrects only the existing Global Telecel flows', () => {
    expect(sql).toContain("provider = 'telecel'");
    expect(sql).toContain("transaction_type = 'airtime'");
    expect(sql).toContain("transaction_type = 'balance_enquiry'");

    expect(sql).toContain('company_id is null');
    expect(sql).toContain('owner_user_id is null');

    expect(sql).not.toContain(
      "transaction_type = 'buy_airtime'",
    );
  });

  test('uses the live-confirmed Airtime Other Phone sequence', () => {
    expectMarkersInOrder(
      "array['buy airtime or data']",
      "array['airtime', 'buy data']",
      "array['my phone', 'other phone']",
      "array['enter phone number']",
      "array['re-enter phone number']",
      "array['enter amount']",
      "array['enter operator id']",
      "array['buy airtime of ghs', 'enter pin to confirm']",
    );
  });

  test('enters the recipient phone exactly twice', () => {
    expect(
      sql.match(/'send_customer_phone'::ussd_flow_action/g) || [],
    ).toHaveLength(2);
  });

  test('uses dynamic Operator ID and stops at PIN', () => {
    expect(sql).toContain(
      "'send_operator_id'::ussd_flow_action",
    );

    expect(sql).toContain(
      "'pin_prompt'::ussd_flow_action",
    );

    expect(sql).not.toContain("'send_pin'");
  });

  test('uses the verified Airtime success markers', () => {
    expect(sql).toContain("'confirmed.'");
    expect(sql).toContain("'you bought ghs'");
    expect(sql).toContain("'of airtime for'");
  });

  test('does not use a bare cancel failure marker', () => {
    expect(sql).not.toMatch(
      /failure_markers\s*=\s*array\[[^\]]*'cancel'[^\]]*\]/s,
    );
  });

  test('uses the live My Account menu number for Balance', () => {
    const balanceStart = sql.indexOf(
      "transaction_type = 'balance_enquiry'",
    );

    const balanceSql = sql.substring(balanceStart);

    expect(balanceSql).toContain("array['my account']");
    expect(balanceSql).toContain("'8'");
    expect(balanceSql).toContain("array['show balance']");
    expect(balanceSql).toContain("'1'");
  });

  test('Balance stops at the secure PIN boundary', () => {
    const balanceStart = sql.indexOf(
      '-- balance enquiry',
    );

    const balanceSql = sql.substring(balanceStart);

    expect(balanceSql).toContain(
      "array['enter operator id']",
    );
    expect(balanceSql).toContain(
      "'send_operator_id'::ussd_flow_action",
    );
    expect(balanceSql).toContain(
      "array['enter pin']",
    );
    expect(balanceSql).toContain(
      "'pin_prompt'::ussd_flow_action",
    );
  });

  test('uses the verified Balance USSD terminal success', () => {
    expect(sql).toContain(
      "'request is processed successfully'",
    );
  });

  test('documents the asynchronous T-CASH balance source', () => {
    expect(sql).toContain(
      'm-pesa account for organization balance',
    );
    expect(sql).toContain(
      'merchant account balance',
    );
  });

  test('does not reintroduce obsolete live menu wording', () => {
    expect(sql).not.toContain("'3 airtime or data sales'");
    expect(sql).not.toContain("'1 airtime sales'");
    expect(sql).not.toContain("'7 my account'");
  });
});
