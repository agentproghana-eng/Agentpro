const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(
  path.join(
    __dirname,
    '../../migrations/158_telecel_merchant_cross_network_live_sequence.sql',
  ),
  'utf8',
);

describe('Telecel Merchant cross-network live sequence correction', () => {
  test('targets only the global active Merchant cross-network flow', () => {
    expect(migration).toContain("provider = 'telecel'");
    expect(migration).toContain(
      "transaction_type = 'send_money_cross_network'",
    );
    expect(migration).toContain("business_sim_role = 'merchant'");
    expect(migration).toContain('company_id IS NULL');
    expect(migration).toContain('owner_user_id IS NULL');
    expect(migration).toContain('is_active = TRUE');
  });

  test('matches the physically observed phone prompt', () => {
    expect(migration).toContain(
      "SET match_all = ARRAY['enter phone number']",
    );
    expect(migration).toContain('step_order = 6');
    expect(migration).toContain(
      "action = 'send_customer_phone'::ussd_flow_action",
    );
  });

  test('matches the physically observed recipient confirmation', () => {
    expect(migration).toContain(
      "'you have requested to send money to'",
    );
    expect(migration).toContain("'confirm'");
    expect(migration).toContain('step_order = 7');
    expect(migration).toContain(
      "action = 'send_digit'::ussd_flow_action",
    );
    expect(migration).toContain("action_value = '1'");
  });

  test('matches the physically observed amount prompt', () => {
    expect(migration).toContain(
      "SET match_all = ARRAY['please enter amount']",
    );
    expect(migration).toContain('step_order = 8');
    expect(migration).toContain(
      "action = 'send_amount'::ussd_flow_action",
    );
  });

  test('does not automate PIN or rewrite the full flow', () => {
    expect(migration).not.toContain(
      "SET action = 'pin_prompt'",
    );
    expect(migration).not.toContain(
      'DELETE FROM ussd_flow_steps',
    );
    expect(migration).not.toContain(
      'INSERT INTO ussd_flow_steps',
    );
  });

  test('does not modify the post-PIN confirmation step', () => {
    expect(migration).not.toContain('step_order = 11');
    expect(migration).not.toContain(
      "SET match_all = ARRAY['fee', 'confirm']",
    );
  });
});
