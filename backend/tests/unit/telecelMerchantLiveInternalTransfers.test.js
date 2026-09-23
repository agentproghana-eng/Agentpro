'use strict';

const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(
  path.join(
    __dirname,
    '../../migrations/146_correct_telecel_live_internal_transfers.sql',
  ),
  'utf8',
).toLowerCase();

const labels = fs.readFileSync(
  path.join(
    __dirname,
    '../../../flutter_app/lib/shared/utils/transaction_labels.dart',
  ),
  'utf8',
).toLowerCase();

const balanceScreen = fs.readFileSync(
  path.join(
    __dirname,
    '../../../flutter_app/lib/features/balances/my_balance_screen.dart',
  ),
  'utf8',
).toLowerCase();

describe('Telecel Agent live internal account transfers', () => {
  test('targets only Global Agent Telecel transfer identities', () => {
    expect(migration).toContain(
      "transaction_type = 'float_to_working'",
    );
    expect(migration).toContain(
      "transaction_type = 'working_to_float'",
    );
    expect(migration).toContain(
      "business_sim_role = 'agent'",
    );
    expect(migration).toContain('company_id is null');
    expect(migration).toContain('owner_user_id is null');
  });

  test('Merchant Account to Working Account uses live menu option 3', () => {
    const start = migration.indexOf(
      '-- merchant account -> working account',
    );
    const end = migration.indexOf(
      '-- working account -> merchant account',
    );

    const flow = migration.substring(start, end);

    expect(flow).toContain(
      "array['send money', 'withdraw cash']",
    );
    expect(flow).toContain(
      "'send_digit'::ussd_flow_action,\n      '3'",
    );
    expect(flow).toContain(
      "'from merchant account to working account'",
    );
    expect(flow).toContain(
      "'transferred from merchant to working'",
    );
  });

  test('Working Account to Merchant Account uses live menu option 4', () => {
    const start = migration.indexOf(
      '-- working account -> merchant account',
    );

    const flow = migration.substring(start);

    expect(flow).toContain(
      "array['send money', 'withdraw cash']",
    );
    expect(flow).toContain(
      "'send_digit'::ussd_flow_action,\n      '4'",
    );
    expect(flow).toContain(
      "'from working account to merchant account'",
    );
    expect(flow).toContain(
      "'transferred from working to merchant'",
    );
  });

  test('both live routes enter amount, Operator ID and one manual PIN', () => {
    expect(
      migration.match(
        /'send_amount'::ussd_flow_action/g,
      ) || [],
    ).toHaveLength(2);

    expect(
      migration.match(
        /'send_operator_id'::ussd_flow_action/g,
      ) || [],
    ).toHaveLength(2);

    expect(
      migration.match(
        /'pin_prompt'::ussd_flow_action/g,
      ) || [],
    ).toHaveLength(2);

    expect(migration).not.toContain("'send_pin'");
  });

  test('does not preserve the obsolete Agent Transactions Move Money path', () => {
    expect(migration).not.toContain("'2 agent transactions'");
    expect(migration).not.toContain("'2 move money'");
    expect(migration).not.toContain("'1 from working account'");
    expect(migration).not.toContain("'2 from float'");
  });

  test('uses current Telecel account terminology in Flutter', () => {
    expect(labels).toContain(
      "return 'working account to merchant account'",
    );

    expect(labels).toContain(
      "return 'merchant account to working account'",
    );

    expect(balanceScreen).toContain(
      "label: 'working account to merchant account'",
    );

    expect(balanceScreen).toContain(
      "label: 'merchant account to working account'",
    );
  });
});
