'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '../../migrations/118_telecel_personal_data_categories.sql'
);

const sql = fs.readFileSync(migrationPath, 'utf8');

describe('Telecel Personal restored data categories', () => {
  test('restores the five live categories missing from migration 107', () => {
    const expected = [
      "('flexi', '1')",
      "('2moorch', '2')",
      "('weekly', '4')",
      "('monthly', '5')",
      "('night', '6')",
    ];

    for (const category of expected) {
      expect(sql).toContain(category);
    }

    expect(sql).not.toContain("('daily', '3')");
    expect(sql).not.toContain("'m4m_live'");
  });

  test('creates both Self and Other flow identities', () => {
    expect(sql).toContain(
      "FOREACH v_recipient IN ARRAY ARRAY['self', 'other']"
    );

    expect(sql).toContain(
      "COALESCE(bundle_category, '') = v_category"
    );

    expect(sql).toContain(
      "COALESCE(recipient_mode, '') = v_recipient"
    );
  });

  test('keeps live package selection entirely user controlled', () => {
    expect(sql).toContain(
      "'await_user_selection'::ussd_flow_action"
    );

    expect(sql).toContain("'until_pin'");

    expect(sql).not.toContain(
      "'send_selection'::ussd_flow_action"
    );

    expect(sql).not.toContain(
      "'send_amount'::ussd_flow_action"
    );
  });

  test('keeps PIN entry manual', () => {
    expect(sql).toContain(
      "ARRAY['enter pin']"
    );

    expect(sql).toContain(
      "'pin_prompt'::ussd_flow_action"
    );

    expect(sql).not.toContain(
      "'auto_confirm_once'::ussd_flow_action"
    );
  });

  test('preserves the verified Telecel *110# path', () => {
    expect(sql).toContain("'*110#'");
    expect(sql).toContain(
      "ARRAY['send money', 'withdraw cash', 'airtime and bundles']"
    );
    expect(sql).toContain(
      "ARRAY['buy airtime', 'data bundles', 'special offers']"
    );
    expect(sql).toContain(
      "ARRAY['select option', 'flexi', 'night king']"
    );
  });
});
