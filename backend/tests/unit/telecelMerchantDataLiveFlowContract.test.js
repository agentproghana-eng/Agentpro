'use strict';

const fs = require('fs');
const path = require('path');

const migration = fs
  .readFileSync(
    path.join(
      __dirname,
      '../../migrations/161_telecel_merchant_data_live_flow.sql',
    ),
    'utf8',
  )
  .toLowerCase();

describe('Telecel Merchant Data live flow', () => {
  test('targets only Global Telecel Merchant data_bundle', () => {
    expect(migration).toContain("provider = 'telecel'");
    expect(migration).toContain("transaction_type = 'data_bundle'");
    expect(migration).toContain("business_sim_role = 'merchant'");
    expect(migration).toContain('company_id is null');
    expect(migration).toContain('owner_user_id is null');
    expect(migration).toContain("coalesce(bundle_category, '') = ''");
  });

  test('preserves historical Personal and Agent Data flows', () => {
    expect(migration).toContain(
      'historical personal and agent data flows are deliberately untouched',
    );
    expect(migration).not.toContain("set business_sim_role = 'merchant'");
  });

  test('creates exact Self and Other Merchant recipient variants', () => {
    expect(migration).toContain("recipient_mode = 'self'");
    expect(migration).toContain("recipient_mode = 'other'");
    expect(migration).toContain("recipient_mode in ('self', 'other')");
  });

  test('uses the live Operator-ID-first Self sequence', () => {
    const start = migration.indexOf('-- merchant data · self');
    const end = migration.indexOf('-- merchant data · other');
    const selfSql = migration.substring(start, end);

    const operator = selfSql.indexOf("'send_operator_id'::ussd_flow_action");
    const recipient = selfSql.indexOf(
      "array['select option', 'self', 'other']",
    );

    expect(selfSql).toContain("array['buy airtime or data']");
    expect(selfSql).toContain("array['airtime', 'buy data']");
    expect(operator).toBeGreaterThan(-1);
    expect(recipient).toBeGreaterThan(operator);
    expect(selfSql).toContain("'await_user_selection'::ussd_flow_action");
    expect(selfSql).toContain("'until_pin'");
    expect(selfSql).toContain("'pin_prompt'::ussd_flow_action");
    expect(selfSql).not.toContain(
      "'send_customer_phone'::ussd_flow_action",
    );
  });

  test('Other uses verified receiver choice and double-phone sequence', () => {
    const start = migration.indexOf('-- merchant data · other');
    const otherSql = migration.substring(start);

    const operator = otherSql.indexOf("'send_operator_id'::ussd_flow_action");
    const recipientMode = otherSql.indexOf(
      "array['select option', 'self', 'other']",
    );
    const receiverChoice = otherSql.indexOf(
      "array['choose the receiver', 'enter recipient number']",
    );

    expect(operator).toBeGreaterThan(-1);
    expect(recipientMode).toBeGreaterThan(operator);
    expect(receiverChoice).toBeGreaterThan(recipientMode);

    expect(
      otherSql.match(/'send_customer_phone'::ussd_flow_action/g) || [],
    ).toHaveLength(2);

    expect(otherSql).toContain("'await_user_selection'::ussd_flow_action");
    expect(otherSql).toContain("'until_pin'");
    expect(otherSql).toContain("'pin_prompt'::ussd_flow_action");
  });

  test('does not hard-code the changing provider bundle catalogue', () => {
    expect(migration).not.toContain("'send_selection'::ussd_flow_action");
    expect(migration).not.toContain("'send_amount'::ussd_flow_action");

    expect(migration).not.toContain('25mb');
    expect(migration).not.toContain('55mb');
    expect(migration).not.toContain('655mb');
    expect(migration).not.toContain('9gb');
    expect(migration).not.toContain('125gb');
    expect(migration).not.toContain('225gb');
  });

  test('never submits PIN or Organisation Shortcode', () => {
    expect(migration).not.toContain("'send_pin'");
    expect(migration).not.toContain(
      "'send_organisation_shortcode'::ussd_flow_action",
    );
    expect(migration).toContain("'pin_prompt'::ussd_flow_action");
  });

  test('uses live-confirmed terminal success markers', () => {
    expect(migration).toContain("'confirmed.'");
    expect(migration).toContain("'bundle purchase request'");
  });

  test('fails closed on partial Merchant Data state', () => {
    expect(migration).toContain(
      'if existing_variant_count not in (0, 2) then',
    );
    expect(migration).toContain(
      'if final_variant_count <> 2 then',
    );
  });
});
