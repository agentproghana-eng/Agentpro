'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '../../migrations/080_seed_mtn_personal_airtime_flows.sql'
);

const sql = fs.readFileSync(migrationPath, 'utf8');

const selfStart = sql.indexOf('-- Self\nINSERT INTO ussd_flow_steps');
const othersStart = sql.indexOf('-- Others\nINSERT INTO ussd_flow_steps');

if (selfStart < 0 || othersStart < 0 || othersStart <= selfStart) {
  throw new Error('Unable to locate MTN Personal Airtime flow blocks');
}

const selfSql = sql.slice(selfStart, othersStart);
const othersSql = sql.slice(othersStart);

describe('MTN Personal Buy Airtime flows', () => {
  test('seeds separate Self and Others Global variants', () => {
    expect(sql).toContain(
      "COALESCE(recipient_mode, '') = 'self'"
    );

    expect(sql).toContain(
      "COALESCE(recipient_mode, '') = 'other'"
    );

    expect(sql).toContain(
      "transaction_type = 'buy_airtime'"
    );
  });

  test('Self follows live menu 3 -> 1 -> 1', () => {
    expect(selfSql).toContain(
      "ARRAY['airtime&bundles']"
    );

    expect(selfSql).toContain(
      "ARRAY['internet bundles', 'fixed broadband', 'schedule airtime']"
    );

    expect(selfSql).toContain(
      "ARRAY['self', 'others', 'welcome pack', 'other networks']"
    );

    const digits = [...selfSql.matchAll(
      /'send_digit',\s*\n\s*'([0-9]+)'/g
    )].map((match) => match[1]);

    expect(digits).toEqual(['3', '1', '1']);
  });

  test('Self sends amount and never sends a phone number', () => {
    expect(selfSql).toContain(
      "ARRAY['enter amount']"
    );

    expect(selfSql).toContain(
      "'send_amount'"
    );

    expect(selfSql).not.toContain(
      "'send_customer_phone'"
    );
  });

  test('Others follows live menu 3 -> 1 -> 2', () => {
    const digits = [...othersSql.matchAll(
      /'send_digit',\s*\n\s*'([0-9]+)'/g
    )].map((match) => match[1]);

    expect(digits).toEqual(['3', '1', '2']);
  });

  test('Others sends amount before entering the phone twice', () => {
    const amountIndex = othersSql.indexOf(
      "ARRAY['enter amount']"
    );

    const mobileIndex = othersSql.indexOf(
      "ARRAY['enter mobile number']"
    );

    const repeatIndex = othersSql.indexOf(
      "ARRAY['repeat mobile number']"
    );

    expect(amountIndex).toBeGreaterThan(-1);
    expect(mobileIndex).toBeGreaterThan(amountIndex);
    expect(repeatIndex).toBeGreaterThan(mobileIndex);

    const phoneActions = othersSql.match(
      /'send_customer_phone'/g
    ) || [];

    expect(phoneActions).toHaveLength(2);
  });

  test('both variants stop at the manual MM PIN boundary', () => {
    expect(selfSql).toContain(
      "ARRAY['enter mm pin']"
    );

    expect(othersSql).toContain(
      "ARRAY['enter mm pin']"
    );

    expect(selfSql).toContain("'pin_prompt'");
    expect(othersSql).toContain("'pin_prompt'");

    expect(sql).not.toContain(
      "'auto_confirm_once'"
    );
  });

  test('does not invent unverified final network result markers', () => {
    const emptyMarkers = sql.match(
      /ARRAY\[\]::TEXT\[\]/g
    ) || [];

    expect(emptyMarkers.length).toBeGreaterThanOrEqual(4);
  });
});
