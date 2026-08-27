const {
  VALID_FLOW_ACTIONS,
  validateFlowSteps,
} = require('../../src/utils/ussdFlowValidation');

describe('USSD Flow validation', () => {
  const baseSteps = () => [
    {
      match_all: ['enter amount'],
      action: 'send_amount',
    },
    {
      match_all: ['enter pin'],
      action: 'pin_prompt',
    },
  ];

  it('accepts Direct USSD String with zero interactive steps', () => {
    expect(
      validateFlowSteps([], {
        executionMode: 'direct',
      })
    ).toBeNull();
  });

  it('rejects interactive steps inside Direct USSD String mode', () => {
    expect(
      validateFlowSteps(baseSteps(), {
        executionMode: 'direct',
      })
    ).toContain('must not contain interactive steps');
  });

  it('keeps empty Interactive Flow invalid', () => {
    expect(
      validateFlowSteps([], {
        executionMode: 'interactive',
      })
    ).toContain('At least one step is required');
  });

  it('rejects unknown execution modes', () => {
    expect(
      validateFlowSteps([], {
        executionMode: 'future_mode',
      })
    ).toContain('execution_mode must be interactive or direct');
  });

  it('accepts a normal flow containing a PIN prompt', () => {
    expect(validateFlowSteps(baseSteps())).toBeNull();
  });

  it('accepts auto_confirm_once with exactly one numeric menu digit', () => {
    const steps = baseSteps();
    steps.push({
      match_all: ['press 1 to confirm'],
      action: 'auto_confirm_once',
      action_value: '1',
    });

    expect(validateFlowSteps(steps)).toBeNull();
  });

  it.each([
    '',
    '10',
    '1234',
    'yes',
    'Y',
    '*',
    ' 1 ',
  ])(
    'rejects unsafe auto_confirm_once action_value %p',
    (actionValue) => {
      const steps = baseSteps();
      steps.push({
        match_all: ['confirm'],
        action: 'auto_confirm_once',
        action_value: actionValue,
      });

      expect(validateFlowSteps(steps)).toContain(
        'exactly one numeric menu digit'
      );
    }
  );

  it('rejects auto_confirm_once before pin_prompt', () => {
    const steps = [
      {
        match_all: ['press 1 to confirm'],
        action: 'auto_confirm_once',
        action_value: '1',
      },
      {
        match_all: ['enter pin'],
        action: 'pin_prompt',
      },
    ];

    expect(validateFlowSteps(steps)).toContain(
      'must appear after the pin_prompt step'
    );
  });

  it('rejects more than one auto_confirm_once step', () => {
    const steps = baseSteps();
    steps.push(
      {
        match_all: ['press 1 to confirm'],
        action: 'auto_confirm_once',
        action_value: '1',
      },
      {
        match_all: ['press 2 to continue'],
        action: 'auto_confirm_once',
        action_value: '2',
      }
    );

    expect(validateFlowSteps(steps)).toContain(
      'at most one auto_confirm_once step'
    );
  });

  it('rejects a flow with no PIN prompt', () => {
    const steps = [
      {
        match_all: ['enter amount'],
        action: 'send_amount',
      },
    ];

    expect(validateFlowSteps(steps)).toContain('no pin_prompt step');
  });

  it('rejects unknown interpreter actions', () => {
    const steps = baseSteps();
    steps.unshift({
      match_all: ['something'],
      action: 'future_unknown_action',
    });

    expect(validateFlowSteps(steps)).toContain('is not a valid action');
  });

  it('keeps send_selection as a valid data-driven action', () => {
    expect(VALID_FLOW_ACTIONS).toContain('send_selection');

    const steps = [
      {
        match_all: ['choose bundle'],
        action: 'send_selection',
      },
      {
        match_all: ['enter pin'],
        action: 'pin_prompt',
      },
    ];

    expect(validateFlowSteps(steps)).toBeNull();
  });

  it.each([
    null,
    'not-an-object',
    42,
    [],
  ])('rejects malformed step value %p', (invalidStep) => {
    const steps = [
      invalidStep,
      {
        match_all: ['enter pin'],
        action: 'pin_prompt',
      },
    ];

    expect(validateFlowSteps(steps)).toContain('step must be an object');
  });

  it.each([
    [['']],
    [['   ']],
    [[123]],
    [[null]],
  ])('rejects unsafe match_all entries %p', (matchAll) => {
    const steps = baseSteps();
    steps[0] = {
      match_all: matchAll,
      action: 'send_amount',
    };

    expect(validateFlowSteps(steps)).toContain(
      'every match_all entry must be a non-empty string'
    );
  });

  it('rejects more than one pin_prompt boundary', () => {
    const steps = baseSteps();
    steps.push({
      match_all: ['enter second pin'],
      action: 'pin_prompt',
    });

    expect(validateFlowSteps(steps)).toContain(
      'exactly one pin_prompt step'
    );
  });

  it('rejects ordinary automation actions after pin_prompt', () => {
    const steps = baseSteps();
    steps.push({
      match_all: ['continue'],
      action: 'send_digit',
      action_value: '1',
    });

    expect(validateFlowSteps(steps)).toContain(
      'only auto_confirm_once may run after PIN entry'
    );
  });

});
