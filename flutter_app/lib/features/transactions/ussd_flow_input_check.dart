/// Checks that a resolved USSD flow has every input its steps will type.
///
/// A step that needs a value the form did not supply makes the dialer wait
/// without answering, which strands the session on the provider menu. Failing
/// before any USSD request is sent keeps that from happening.
String? missingUssdFlowInput({
  required List<Map<String, dynamic>> steps,
  required Map<String, String> params,
  required String transactionType,
}) {
  bool blank(String? value) => value == null || value.trim().isEmpty;

  final actions = steps.map((step) => step['action']?.toString()).toSet();

  // Send Money variants credit the recipient, not the customer.
  final usesRecipientPhone = const {
    'send_money',
    'send_money_same_network',
    'send_money_cross_network',
  }.contains(transactionType);

  if (actions.contains('send_customer_phone') &&
      blank(usesRecipientPhone
          ? params['recipient_phone']
          : params['customer_phone'])) {
    return 'phone number';
  }

  if (actions.contains('send_amount')) {
    final amount = double.tryParse(
      (params['amount'] ?? '').replaceAll(',', '').trim(),
    );
    if (amount == null || amount <= 0) return 'amount';
  }

  if (actions.contains('send_reference') && blank(params['payment_reference'])) {
    return 'reference';
  }

  if (actions.contains('send_merchant_id') && blank(params['merchant_id'])) {
    return 'merchant ID';
  }

  if (actions.contains('send_account_number') &&
      blank(params['account_number'])) {
    return 'account number';
  }

  return null;
}

/// True when the flow types a protected Telecel credential (Operator ID or
/// organisation shortcode). Those are only issued by the server, so such a
/// flow cannot start without a connection.
bool ussdFlowNeedsProtectedCredential(Map<String, dynamic>? flow) {
  final steps = flow?['steps'];
  if (steps is! List) return false;

  return steps.any((step) {
    if (step is! Map) return false;
    final action = step['action']?.toString();
    return action == 'send_operator_id' ||
        action == 'send_organisation_shortcode';
  });
}
