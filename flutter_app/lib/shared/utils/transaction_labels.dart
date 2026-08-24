String? canonicalBusinessTransactionType(
  String? type,
  String? provider,
) {
  final normalizedType = type?.trim();

  if (normalizedType == null || normalizedType.isEmpty) {
    return null;
  }

  final normalizedProvider = provider?.trim().toLowerCase();

  // MTN Agent Cash In is the canonical send_money flow. The legacy
  // cash_in identifier must never resurrect the retired MTN Cash In path.
  if (normalizedProvider == 'mtn' &&
      normalizedType.toLowerCase() == 'cash_in') {
    return 'send_money';
  }

  return normalizedType;
}

// Maps a transaction_type + provider combo to its user-facing label.
//
// Agent provider terminology:
//   MTN send_money  -> Cash In
//   Telecel cash_in -> Deposit
//   AT Money cash_in -> Deposit
//
// Internal transaction types remain stable for API/database compatibility.
// This shared mapper keeps forms and transaction-history labels consistent.
String transactionTypeLabel(String type, String provider) {
  // MTN Agent's internal send_money flow is the customer Cash In flow.
  if (provider == 'mtn' && type == 'send_money') {
    return 'Cash In';
  }

  // Telecel and AT Money call their customer cash-in operation Deposit.
  if ((provider == 'telecel' || provider == 'at_money') && type == 'cash_in') {
    return 'Deposit';
  }

  if (provider == 'telecel' && type == 'cash_out') {
    return 'Withdrawal';
  }
  switch (type) {
    case 'cash_in':
      return 'Cash In';
    case 'cash_out':
      return 'Cash Out';
    case 'send_money':
      return 'Send Money';
    case 'merchant_payment':
      return 'Pay to Merchant';
    case 'bill_payment':
      return 'Pay to Agent';
    case 'airtime':
      return 'Airtime';
    case 'data_bundle':
      return 'Data Bundle';
    case 'balance_enquiry':
      return 'Check Balance';
    case 'commission_balance':
      return 'Commission Balance';
    case 'cash_in_commission':
      return 'Cash In Commission';
    case 'cash_out_commission':
      return 'Cash Out Commission';
    case 'commission_transfer':
      return 'Commission to Float';
    case 'float_received':
      return 'Float Received';
    case 'working_to_float':
      return 'Working Account to Float';
    case 'float_to_working':
      return 'Float to Working Account';
    case 'business_deposit':
      return 'Business Deposit';
    case 'business_withdrawal':
      return 'Business Withdrawal';
    default:
      if (type.isEmpty) return '';
      return type
          .replaceAll('_', ' ')
          .split(' ')
          .map((w) => w.isEmpty ? w : w[0].toUpperCase() + w.substring(1))
          .join(' ');
  }
}
