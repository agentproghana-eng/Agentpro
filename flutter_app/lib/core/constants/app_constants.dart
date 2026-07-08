class AppConstants {
  AppConstants._();

  // ── API ──────────────────────────────────────────────────────
static const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://127.0.0.1:3000/v1',
);

  // For local development:
  // static const String apiBaseUrl = 'http://10.0.2.2:3000/v1';

  // ── App Info ─────────────────────────────────────────────────
  static const String appName = 'Agent Pro Ghana';
  static const String appTagline = 'One App. Every Mobile Money Business.';
  static const String appVersion = '2.0.0';
  static const String supportEmail = 'support@agentproghana.com';
  static const String websiteUrl = 'https://agentproghana.com';

  // ── MoMo Providers ───────────────────────────────────────────
  static const Map<String, String> providerNames = {
    'mtn': 'MTN Mobile Money',
    'telecel': 'Telecel Cash',
    'at_money': 'AT Money',
  };

  static const Map<String, String> providerUSSDCodes = {
    'mtn': '*170#',
    'telecel': '*110#',
    'at_money': '*500#',
  };

  static const Map<String, String> providerSupportNumbers = {
    'mtn': '100',
    'telecel': '100',
    'at_money': '100',
  };

  // ── Transaction Types ─────────────────────────────────────────
  static const Map<String, String> transactionTypeNames = {
    'cash_in': 'Cash In',
    'cash_out': 'Cash Out',
    'send_money': 'Send Money',
    'merchant_payment': 'Merchant Payment',
    'bill_payment': 'Bill Payment',
    'airtime': 'Airtime',
    'data_bundle': 'Data Bundle',
    'balance_enquiry': 'Balance Enquiry',
    'mini_statement': 'Mini Statement',
    'reversal': 'Reversal',
  };

  // ── Subscription ──────────────────────────────────────────────
  static const double subscriptionPrice = 10.00;
  static const String subscriptionCurrency = 'GHS';
  static const String subscriptionCurrencySymbol = 'GH₵';

  // ── Security ──────────────────────────────────────────────────
  /// This message must be shown whenever anyone asks for a MoMo PIN
  static const String pinSecurityMessage =
      'Agent Pro Ghana never asks for your MoMo PIN. '
      'Enter your PIN only on the official network USSD screen.';

  static const String pinWarningMessage =
      '⚠️ Never share your Mobile Money PIN with anyone, '
      'including this app. Your PIN is private.';

  // ── Inactivity timeout ────────────────────────────────────────
  static const Duration inactivityTimeout = Duration(minutes: 5);

  // ── Pagination ────────────────────────────────────────────────
  static const int defaultPageSize = 20;

  // ── Cache durations ───────────────────────────────────────────
  static const Duration dashboardCacheDuration = Duration(minutes: 5);
  static const Duration floatCacheDuration = Duration(minutes: 2);
}
