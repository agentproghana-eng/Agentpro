/// Conservative eligibility check for Quick Action direct-start.
///
/// This does not initiate transactions or interact with USSD.
/// It only evaluates the live, resolved flow configuration.
class ZeroInputFlowEligibility {
  static const Set<String> _supportedZeroInputTypes = {
    'balance_enquiry',
    'check_momo_balance',
    'check_airtime_balance',
  };

  static const Set<String> _safeActions = {
    'send_digit',
    'send_literal',
    'pin_prompt',
  };

  static bool isEligible(
    Map<String, dynamic> flow, {
    required String provider,
    required String transactionType,
    String? bundleCategory,
    String? recipientMode,
    String? businessSimRole,
  }) {
    String normalized(dynamic value) =>
        (value ?? '').toString().trim().toLowerCase();

    if (!_supportedZeroInputTypes.contains(
      normalized(transactionType),
    )) {
      return false;
    }

    // Balance enquiries must resolve to their unqualified flow.
    // Never infer a bundle or recipient variant for auto-start.
    if (normalized(bundleCategory).isNotEmpty ||
        normalized(recipientMode).isNotEmpty) {
      return false;
    }

    if (normalized(flow['provider']) != normalized(provider) ||
        normalized(flow['transaction_type']) !=
            normalized(transactionType) ||
        normalized(flow['bundle_category']) !=
            normalized(bundleCategory) ||
        normalized(flow['recipient_mode']) !=
            normalized(recipientMode)) {
      return false;
    }

    if (businessSimRole != null &&
        normalized(flow['business_sim_role']) !=
            normalized(businessSimRole)) {
      return false;
    }

    if (flow['is_active'] != true) {
      return false;
    }

    // A flow without an authoritative identity must never authorize
    // bypassing the transaction form.
    if (normalized(flow['id']).isEmpty) {
      return false;
    }

    final mode = normalized(flow['execution_mode']);

    if (mode == 'direct') {
      final steps = flow['steps'];
      return steps is List && steps.isEmpty &&
          normalized(flow['dial_code']).isNotEmpty;
    }

    if (mode != 'interactive') {
      return false;
    }

    final steps = flow['steps'];

    if (steps is! List || steps.isEmpty) {
      return false;
    }

    for (final step in steps) {
      if (step is! Map) {
        return false;
      }

      final action = normalized(step['action']);

      if (!_safeActions.contains(action)) {
        return false;
      }

      if (action == 'send_digit' || action == 'send_literal') {
        if (normalized(step['action_value']).isEmpty) {
          return false;
        }
      }
    }

    return true;
  }
}
