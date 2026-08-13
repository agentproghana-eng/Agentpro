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

  for (const [i, step] of steps.entries()) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      return `Step ${i + 1}: step must be an object.`;
    }

    if (!Array.isArray(step.match_all) || step.match_all.length === 0) {
      return (
        `Step ${i + 1}: match_all cannot be empty — ` +
        'a step with no match text can never fire safely.'
      );
    }

    const hasUnsafeMatcher = step.match_all.some(
      (marker) => typeof marker !== 'string' || marker.trim().length === 0
    );

    if (hasUnsafeMatcher) {
      return (
        `Step ${i + 1}: every match_all entry must be a non-empty string — ` +
        'blank or non-string matchers are unsafe.'
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

  const pinPromptIndexes = steps
    .map((step, index) => (step.action === 'pin_prompt' ? index : -1))
    .filter((index) => index >= 0);

  if (pinPromptIndexes.length === 0) {
    return (
      'Flow has no pin_prompt step — without one, the app will never ' +
      'pause for real PIN entry, and may try to auto-submit a sensitive screen.'
    );
  }

  if (pinPromptIndexes.length > 1) {
    return (
      'Flow must contain exactly one pin_prompt step — multiple PIN ' +
      'boundaries are ambiguous and are not supported safely.'
    );
  }

  const pinPromptIndex = pinPromptIndexes[0];

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
    autoConfirmIndexes[0] <= pinPromptIndex
  ) {
    return (
      `Step ${autoConfirmIndexes[0] + 1}: auto_confirm_once must appear ` +
      'after the pin_prompt step.'
    );
  }

  for (let i = pinPromptIndex + 1; i < steps.length; i++) {
    if (steps[i].action !== 'auto_confirm_once') {
      return (
        `Step ${i + 1}: action "${steps[i].action}" is not allowed after ` +
        'pin_prompt; only auto_confirm_once may run after PIN entry.'
      );
    }
  }

  return null;
}

module.exports = {
  VALID_FLOW_ACTIONS,
  validateFlowSteps,
};
