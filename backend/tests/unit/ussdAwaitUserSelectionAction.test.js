const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

const read = relative =>
  fs.readFileSync(path.join(root, relative), 'utf8');

describe('USSD await_user_selection action', () => {
  const migration = read(
    'migrations/112_add_ussd_await_user_selection.sql'
  );

  const validation = read(
    'src/utils/ussdFlowValidation.js'
  );

  const native = read(
    '../flutter_app/android/app/src/main/kotlin/' +
      'com/agentpro/ghana/UssdAccessibilityService.kt'
  );

  test('adds the action to the PostgreSQL enum and backend registry', () => {
    expect(migration).toContain(
      "ADD VALUE IF NOT EXISTS 'await_user_selection'"
    );

    expect(validation).toContain(
      "'await_user_selection'"
    );
  });

  test('wait action is value-less', () => {
    const requiredStart = validation.indexOf(
      'const VALUE_REQUIRED_FLOW_ACTIONS'
    );

    const requiredEnd = validation.indexOf(
      'function validateFlowSteps'
    );

    const requiredBlock = validation.slice(
      requiredStart,
      requiredEnd
    );

    expect(requiredBlock).not.toContain(
      'await_user_selection'
    );
  });

  test('native wait action performs no Accessibility write', () => {
    const start = native.indexOf(
      '"await_user_selection" -> {'
    );

    const end = native.indexOf(
      '"send_digit", "send_literal" ->',
      start
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const waitBlock = native.slice(start, end);

    expect(waitBlock).toContain(
      'awaitingUserSelectionMatchers'
    );

    expect(waitBlock).not.toContain(
      'respond('
    );

    expect(waitBlock).not.toContain(
      'performAction'
    );
  });

  test('same manual menu is exempt from mismatch termination', () => {
    expect(native).toContain(
      'val awaitingMatchers = awaitingUserSelectionMatchers'
    );

    expect(native).toContain(
      'if (stillOnAwaitedMenu)'
    );

    expect(native).toContain(
      'resetGenericFlowMismatchState()'
    );
  });

  test('manual wait state is wiped on every session boundary', () => {
    const resetCount = (
      native.match(/awaitingUserSelectionMatchers = null/g) || []
    ).length;

    expect(resetCount).toBeGreaterThanOrEqual(3);
  });
});
