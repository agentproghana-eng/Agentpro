// Maps a transaction_type + provider combo to its user-facing label.
// Provider-aware because Telecel brands its own USSD menu options
// "Deposit"/"Withdrawal" rather than "Cash In"/"Cash Out" - a single
// generic mapping would be wrong for Telecel specifically. This is
// the one shared source of truth for this mapping, used by both the
// Home screen's recent-transactions list and the transaction form's
// own title, so they can never drift out of sync with each other
// again the way they did before this fix.
String transactionTypeLabel(String type, String provider) {
  if (provider == 'telecel') {
    if (type == 'cash_in') return 'Deposit';
    if (type == 'cash_out') return 'Withdrawal';
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
    case 'working_to_float':
      return 'M-PESA to Float';
    case 'float_to_working':
      return 'Float to M-PESA';
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
