/// Converts values collected by the generic server-driven form into the
/// small, fixed set of transaction-initiation fields understood by AgentPro.
///
/// The server may describe presentation and collect values, but it can never
/// remotely create arbitrary request-body keys, PIN fields, authorization
/// controls, ledger instructions, or posting behavior.
class ServerDrivenTransactionSubmission {
  static const Set<String> supportedKeys = <String>{
    'customer_phone',
    'recipient_phone',
    'amount',
    'account_number',
    'merchant_id',
    'reference',
    'operator_id',
  };

  final Map<String, String> _values;

  ServerDrivenTransactionSubmission(
    Map<String, String> values,
  ) : _values = Map<String, String>.unmodifiable(
          values.map(
            (key, value) => MapEntry(
              key,
              value.trim(),
            ),
          ),
        );

  String value(String key) {
    if (!supportedKeys.contains(key)) {
      return '';
    }

    return _values[key] ?? '';
  }

  String get amountText => value('amount');

  double get amount =>
      double.tryParse(
        amountText.replaceAll(',', ''),
      ) ??
      0;

  String get customerPhone => value('customer_phone');

  String get recipientPhone => value('recipient_phone');

  String get accountNumber => value('account_number');

  String get merchantId => value('merchant_id');

  String get reference => value('reference');

  String get operatorId => value('operator_id');

  /// Maps presentation semantics to the existing backend transaction API.
  ///
  /// `reference` deliberately becomes `payment_reference`. Unknown remote
  /// fields are impossible to spread into this map.
  Map<String, dynamic> toRequestFields() {
    final operator = operatorId;

    return <String, dynamic>{
      'amount': amount,
      'customer_phone': customerPhone,
      'recipient_phone': recipientPhone,
      'account_number': accountNumber,
      'payment_reference': reference,
      'merchant_id': merchantId,
      if (operator.isNotEmpty)
        'operator_id': operator,
    };
  }
}
