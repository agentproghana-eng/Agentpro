'use strict';

const fs = require('fs');
const path = require('path');

const migration = fs
  .readFileSync(
    path.join(
      __dirname,
      '../../migrations/164_telecel_merchant_data_category_selection.sql',
    ),
    'utf8',
  )
  .toLowerCase();

describe('Telecel Merchant Data category selection', () => {
  test('targets only exact Global Telecel Merchant Data variants', () => {
    expect(migration).toContain("provider = 'telecel'");
    expect(migration).toContain("transaction_type = 'data_bundle'");
    expect(migration).toContain("business_sim_role = 'merchant'");
    expect(migration).toContain('company_id is null');
    expect(migration).toContain('owner_user_id is null');
    expect(migration).toContain("recipient_mode = 'self'");
    expect(migration).toContain("recipient_mode = 'other'");
  });

  test('fails closed unless migration 161 shape is still present', () => {
    expect(migration).toContain('expected 6 steps');
    expect(migration).toContain('expected 9 steps');
    expect(migration).toContain('step_order = 5');
    expect(migration).toContain('step_order = 8');
    expect(migration).toContain(
      "'await_user_selection'::ussd_flow_action",
    );
    expect(migration).toContain("'until_pin'");
  });

  test('automates exactly one category selection per variant', () => {
    const selections =
      migration.match(/'send_selection'::ussd_flow_action/g) || [];

    // Two inserted actions plus two final invariant checks.
    expect(selections).toHaveLength(4);

    expect(migration).toContain(
      "array['2moorch no expiry', 'night king']",
    );
  });

  test('keeps provider package catalogue read-only until PIN', () => {
    expect(migration).toContain(
      "'await_user_selection'::ussd_flow_action",
    );
    expect(migration).toContain("'until_pin'");
    expect(migration).toContain("'pin_prompt'::ussd_flow_action");

    expect(migration).not.toContain("'send_amount'::ussd_flow_action");
  });

  test('never submits PIN or Organisation Shortcode', () => {
    expect(migration).not.toContain("'send_pin'");
    expect(migration).not.toContain(
      "'send_organisation_shortcode'::ussd_flow_action",
    );
  });

  test('preserves Other double-phone sequence', () => {
    const start = migration.indexOf('-- other');
    const otherSql = migration.substring(start);

    expect(
      otherSql.match(/'send_customer_phone'::ussd_flow_action/g) || [],
    ).toHaveLength(2);
  });

  test('does not encode provider package names or prices', () => {
    expect(migration).not.toContain('25mb');
    expect(migration).not.toContain('55mb');
    expect(migration).not.toContain('655mb');
    expect(migration).not.toContain('9gb');
    expect(migration).not.toContain('125gb');
    expect(migration).not.toContain('225gb');
  });
});
