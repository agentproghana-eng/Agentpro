'use strict';

const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(
  path.join(
    __dirname,
    '../../migrations/160_telecel_merchant_airtime_recipient_variants.sql',
  ),
  'utf8',
).toLowerCase();

describe('Telecel Merchant Airtime recipient variants', () => {
  test('targets only Global Merchant Airtime', () => {
    expect(migration).toContain("provider = 'telecel'");
    expect(migration).toContain("transaction_type = 'airtime'");
    expect(migration).toContain("business_sim_role = 'merchant'");
    expect(migration).toContain('company_id is null');
    expect(migration).toContain('owner_user_id is null');
  });

  test('does not repurpose the historical Agent Airtime row', () => {
    expect(migration).toContain(
      'historical agent row is deliberately untouched',
    );
    expect(migration).not.toContain(
      "set business_sim_role = 'merchant'",
    );
  });

  test('creates explicit Self and Other Merchant variants', () => {
    expect(migration).toContain("'self'");
    expect(migration).toContain("'other'");
    expect(migration).toContain("'merchant'");
    expect(migration).toContain(
      "recipient_mode in ('self', 'other')",
    );
  });

  test('Self follows live My Phone sequence without customer phone', () => {
    const start = migration.indexOf(
      '-- merchant airtime · self / my phone',
    );
    const end = migration.indexOf(
      '-- merchant airtime · other phone',
    );
    const selfSql = migration.substring(start, end);

    expect(selfSql).toContain(
      "'send_digit'::ussd_flow_action,\n      '3'",
    );
    expect(selfSql).toContain(
      "'send_digit'::ussd_flow_action,\n      '1'",
    );
    expect(selfSql).toContain("array['enter amount']");
    expect(selfSql).toContain("'send_amount'::ussd_flow_action");
    expect(selfSql).toContain("array['enter operator id']");
    expect(selfSql).toContain(
      "'send_operator_id'::ussd_flow_action",
    );
    expect(selfSql).toContain("'pin_prompt'::ussd_flow_action");
    expect(selfSql).not.toContain(
      "'send_customer_phone'::ussd_flow_action",
    );
  });

  test('Other follows verified double-phone sequence', () => {
    const start = migration.indexOf(
      '-- merchant airtime · other phone',
    );
    const otherSql = migration.substring(start);

    expect(otherSql).toContain(
      "'send_digit'::ussd_flow_action,\n      '2'",
    );

    expect(
      otherSql.match(
        /'send_customer_phone'::ussd_flow_action/g,
      ) || [],
    ).toHaveLength(2);

    expect(otherSql).toContain("'send_amount'::ussd_flow_action");
    expect(otherSql).toContain(
      "'send_operator_id'::ussd_flow_action",
    );
    expect(otherSql).toContain("'pin_prompt'::ussd_flow_action");
  });

  test('Merchant Airtime never submits PIN or shortcode', () => {
    expect(migration).not.toContain("'send_pin'");
    expect(migration).not.toContain(
      "'send_organisation_shortcode'::ussd_flow_action",
    );
  });

  test('uses verified terminal success markers', () => {
    expect(migration).toContain("'confirmed.'");
    expect(migration).toContain("'you bought ghs'");
    expect(migration).toContain("'of airtime for'");
  });

  test('fails closed on partial Merchant variant state', () => {
    expect(migration).toContain(
      'if existing_variant_count not in (0, 2) then',
    );
    expect(migration).toContain(
      'if final_variant_count <> 2 then',
    );
  });
});
