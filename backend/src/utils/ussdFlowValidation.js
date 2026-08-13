const VALID_FLOW_ACTIONS = Object.freeze([
  'send_digit',
  'send_customer_phone',
  'send_amount',
  'send_operator_id',
  'send_reference',
  'send_merchant_id',
  'send_selection',
  'send_literal',
  'pin_prompt',
  'auto_confirm_once',
]);

const VALUE_REQUIRED_FLOW_ACTIONS = new Set([
  'send_digit',
  'send_literal',
  'auto_confirm_once',
]);

function validateFlowSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return 'At least one step is required.';
  }

  const pinPromptIndex = steps.findIndex(
    (step) => step.action === 'pin_prompt'
  );
  const autoConfirmIndexes = steps
    .map((step, index) =>
      step.action === 'auto_confirm_once' ? index : -1
    )
    .filter((index) => index >= 0);

  if (autoConfirmIndexes.length > 1) {
    return (
      'Flow may contain at most one auto_confirm_once step — ' +
      'post-PIN automatic confirmation is deliberately one-shot.'
    );
  }

  if (
    autoConfirmIndexes.length === 1 &&
    (pinPromptIndex < 0 || autoConfirmIndexes[0] <= pinPromptIndex)
  ) {
    return (
      `Step ${autoConfirmIndexes[0] + 1}: auto_confirm_once must appear ` +
      'after the pin_prompt step.'
    );
  }

  for (const [i, step] of steps.entries()) {
    if (!Array.isArray(step.match_all) || step.match_all.length === 0) {
      return (
        `Step ${i + 1}: match_all cannot be empty — ` +
        'a step with no match text can never fire.'
      );
    }

    if (!VALID_FLOW_ACTIONS.includes(step.action)) {
      return (
        `Step ${i + 1}: "${step.action}" is not a valid action. ` +
        `Must be one of: ${VALID_FLOW_ACTIONS.join(', ')}.`
      );
    }

    // Post-PIN automation is deliberately much narrower than ordinary
    // flow input. It may submit exactly one non-sensitive numeric menu
    // choice and never arbitrary text, transaction data, or PIN-like data.
    //
    // Check this before the generic required-value rule so every invalid
    // auto_confirm_once value — including an empty value — receives the
    // same strict safety error.
    if (
      step.action === 'auto_confirm_once' &&
      !/^[0-9]$/.test(String(step.action_value))
    ) {
      return (
        `Step ${i + 1}: auto_confirm_once action_value must be ` +
        'exactly one numeric menu digit.'
      );
    }

    if (
      VALUE_REQUIRED_FLOW_ACTIONS.has(step.action) &&
      !step.action_value
    ) {
      return (
        `Step ${i + 1}: action "${step.action}" ` +
        'requires an action_value.'
      );
    }
  }

  if (!steps.some((step) => step.action === 'pin_prompt')) {
    return (
      'Flow has no pin_prompt step — without one, the app will never ' +
      'pause for real PIN entry, and may try to auto-submit a sensitive screen.'
    );
  }

  return null;
}

module.exports = {
  VALID_FLOW_ACTIONS,
  validateFlowSteps,
};
