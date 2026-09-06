const fs = require('fs');
const path = require('path');

const enumMigration = fs.readFileSync(
  path.join(
    __dirname,
    '../../migrations/110_add_personal_bank_transfer_types.sql',
  ),
  'utf8',
).toLowerCase();

const migration = fs.readFileSync(
  path.join(
    __dirname,
    '../../migrations/111_seed_telecel_personal_bank_transfer.sql',
  ),
  'utf8',
).toLowerCase();

const route = fs.readFileSync(
  path.join(
    __dirname,
    '../../src/routes/personalTransaction.routes.js',
  ),
  'utf8',
);

const controller = fs.readFileSync(
  path.join(
    __dirname,
    '../../src/controllers/personalTransactionController.js',
  ),
  'utf8',
);

const {
  validateFlowSteps,
} = require('../../src/utils/ussdFlowValidation');

describe('Telecel Personal bank transfer live USSD flow', () => {
  test('registers dedicated transaction and account-number actions', () => {
    expect(enumMigration).toContain(
      "add value if not exists 'send_money_to_bank'",
    );

    expect(enumMigration).toContain(
      "add value if not exists 'send_account_number'",
    );
  });

  test('registers Personal initiation capability', () => {
    expect(migration).toContain("'send_money_to_bank'");
    expect(migration).toContain("'personal'");
    expect(migration).toContain("'send money to bank'");
  });

  test('targets only Global Personal Telecel bank transfer', () => {
    expect(migration).toContain("provider = 'telecel'");
    expect(migration).toContain(
      "transaction_type = 'send_money_to_bank'",
    );
    expect(migration).toContain('company_id is null');
    expect(migration).toContain('owner_user_id is null');
    expect(migration).toContain('business_sim_role is null');
  });

  test('matches complete verified pre-PIN sequence', () => {
    const sequence = [
      "'send money'",
      "'to bank account'",
      "'select your bank starting with alphabet'",
      "'select bank'",
      "'enter account number'",
      "'enter recipient account number again'",
      "'1 confirm'",
      "'please input amount'",
      "'enter reference'",
      "'enter pin'",
    ];

    const indexes = sequence.map(
      (value) => migration.indexOf(value),
    );

    for (const index of indexes) {
      expect(index).toBeGreaterThanOrEqual(0);
    }

    expect(indexes).toEqual(
      [...indexes].sort((a, b) => a - b),
    );
  });

  test('enters account number exactly twice', () => {
    expect(
      (
        migration.match(
          /'send_account_number'::ussd_flow_action/g,
        ) || []
      ).length,
    ).toBe(2);
  });

  test('automatically confirms account holder before PIN', () => {
    expect(migration).toContain("'1 confirm'");
    expect(migration).toContain(
      "'send_digit'::ussd_flow_action",
    );
  });

  test('stops at exactly one PIN boundary', () => {
    expect(
      (
        migration.match(
          /'pin_prompt'::ussd_flow_action/g,
        ) || []
      ).length,
    ).toBe(1);

    expect(migration).not.toContain("'send_pin'");
    expect(migration).not.toContain("'auto_confirm_once'");
    expect(migration).not.toContain("'send_operator_id'");
  });

  test('backend validator accepts send_account_number', () => {
    expect(
      validateFlowSteps([
        {
          match_all: ['enter account number'],
          action: 'send_account_number',
          action_value: null,
        },
        {
          match_all: ['enter pin'],
          action: 'pin_prompt',
          action_value: null,
        },
      ]),
    ).toBeNull();
  });

  test('uses live-confirmed GT Bank routing', () => {
    expect(route).toContain(
      "['gt bank', ['3', '2']]",
    );
  });

  test('keeps raw account number out of database insert', () => {
    const insertStart = controller.indexOf(
      'INSERT INTO personal_transactions',
    );

    const insertEnd = controller.indexOf(
      'RETURNING id, reference, status, created_at',
      insertStart,
    );

    expect(insertStart).toBeGreaterThanOrEqual(0);
    expect(insertEnd).toBeGreaterThan(insertStart);

    const insertContract = controller.substring(
      insertStart,
      insertEnd,
    );

    expect(insertContract).not.toContain(
      'account_number',
    );
  });

  test('includes account number in irreversible operation fingerprint', () => {
    expect(controller).toContain(
      'account_number: normalizePersonalOperationString(',
    );

    expect(controller).toContain(
      'body.account_number',
    );
  });

  test('contains all canonical live-observed banks', () => {
    const banks = [
      'access bank',
      'adb',
      'advans ghana s&l',
      'absa',
      'bank of africa',
      'cal bank',
      'cbg',
      'arb apex bank',
      'affinity',
      'adehyeman s&l',
      'best point',
      'ecobank',
      'fidelity',
      'first atlantic bank',
      'first national bank',
      'firstbank ghana',
      'gcb bank',
      'gt bank',
      'nib',
      'prudential',
      'republic',
      'omnibsic',
      'ghl bank',
      'opportunity international s&l',
      'letshego',
      'it consortium',
      'stanchart',
      'stanbic',
      'uba',
      'umb',
      'zenith',
      'services integrity savings & loans',
      'sg-gh',
      'sinapi aba savings and loans',
    ];

    for (const bank of banks) {
      expect(
        route.toLowerCase(),
      ).toContain(`['${bank}',`);
    }
  });
});
