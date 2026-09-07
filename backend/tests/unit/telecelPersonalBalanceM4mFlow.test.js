const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

const read = relative =>
  fs.readFileSync(path.join(root, relative), 'utf8');

describe('Telecel Personal balance and M4M flow', () => {
  const migration = read(
    'migrations/113_seed_telecel_personal_balance_m4m.sql'
  );

  const controller = read(
    'src/controllers/personalUssdFlowController.js'
  );

  test('*124# is a zero-write PIN-less combined balance flow', () => {
    expect(migration).toContain("'check_airtime_balance'");
    expect(migration).toContain("'*124#'");
    expect(migration).toContain("ARRAY['main ac:']");
    expect(migration).toContain("ARRAY['internet bundle:']");
    expect(migration).toContain(
      "'await_user_selection'::ussd_flow_action"
    );
  });

  test('combined balance capability keeps stable transaction identity', () => {
    expect(migration).toContain(
      "display_label = 'Check Airtime & Data Balance'"
    );

    expect(migration).toContain(
      "transaction_type = 'check_airtime_balance'"
    );
  });

  test('backend PIN-less trust requires exact Global Telecel shape', () => {
    expect(controller).toContain(
      "flow.provider === 'telecel'"
    );

    expect(controller).toContain(
      "flow.dial_code === '*124#'"
    );

    expect(controller).toContain(
      "steps.length === 1"
    );

    expect(controller).toContain(
      "steps[0]?.action === 'await_user_selection'"
    );

    expect(controller).toContain(
      "steps[0].match_all.includes('main ac:')"
    );
  });

  test('M4M keeps live offers and payment choice user-controlled', () => {
    expect(migration).toContain("'*530#'");
    expect(migration).toContain("'m4m_live'");
    expect(migration).toContain("ARRAY['m4m']");
    expect(migration).toContain("'1. airtime'");
    expect(migration).toContain("'2. telecel cash'");

    const m4mStart = migration.indexOf(
      '-- TELECEL PERSONAL M4M LIVE OFFERS'
    );

    const m4m = migration.slice(m4mStart);

    expect(m4m).not.toContain(
      "'send_selection'::ussd_flow_action"
    );

    expect(m4m).not.toContain(
      "'send_digit'::ussd_flow_action"
    );

    expect(m4m).not.toContain(
      "'send_amount'::ussd_flow_action"
    );
  });

  test('M4M terminal result wording remains fail-closed until verified', () => {
    const m4mStart = migration.indexOf(
      '-- TELECEL PERSONAL M4M LIVE OFFERS'
    );

    const m4m = migration.slice(m4mStart);

    expect(m4m).toContain(
      'success_markers = ARRAY[]::TEXT[]'
    );

    expect(m4m).toContain(
      'failure_markers = ARRAY[]::TEXT[]'
    );

    expect(migration).not.toContain("'successful'");
    expect(migration).not.toContain("'successfully'");
    expect(migration).not.toContain("'subscribed'");
  });

  test('Telecel Cash branch has one strict manual PIN boundary', () => {
    const matches =
      migration.match(/'pin_prompt'::ussd_flow_action/g) || [];

    expect(matches).toHaveLength(1);

    expect(migration).toContain(
      "'please enter your pin'"
    );

    expect(migration).toContain(
      "'amount:'"
    );

    expect(migration).not.toContain(
      "'auto_confirm_once'::ussd_flow_action"
    );
  });

  test('three zero-write waits exist: balance plus two M4M menus', () => {
    const waits =
      migration.match(
        /'await_user_selection'::ussd_flow_action/g
      ) || [];

    expect(waits).toHaveLength(3);
  });

  test('changing offer values are not embedded', () => {
    expect(migration).not.toContain('1.5GB');
    expect(migration).not.toContain('3.8GB');
    expect(migration).not.toContain('300mins');
    expect(migration).not.toContain('800mins');
  });
});
