const fs = require('fs');
const path = require('path');

describe('Telecel Merchant bank pre-PIN confirmation migration', () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      '../../migrations/159_telecel_merchant_bank_pre_pin_confirm.sql',
    ),
    'utf8',
  );

  test('targets only the active Global Merchant bank flow', () => {
    expect(migration).toContain("provider = 'telecel'");
    expect(migration).toContain(
      "transaction_type = 'send_money_to_bank'",
    );
    expect(migration).toContain('company_id IS NULL');
    expect(migration).toContain('owner_user_id IS NULL');
    expect(migration).toContain(
      "business_sim_role = 'merchant'",
    );
    expect(migration).toContain('is_active = TRUE');
  });

  test('changes the beneficiary confirmation to an ordinary pre-PIN digit', () => {
    expect(migration).toContain('step_order = 8');
    expect(migration).toContain(
      "action = 'send_digit'::ussd_flow_action",
    );
    expect(migration).toContain("action_value = '1'");
    expect(migration).toContain(
      "'you have requested to send money to'",
    );
    expect(migration).toContain("'1 confirm'");
  });

  test('fails closed if the expected live step is not uniquely updated', () => {
    expect(migration).toContain('GET DIAGNOSTICS v_updated = ROW_COUNT');
    expect(migration).toContain('IF v_updated <> 1 THEN');
  });
});
