import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('MTN Agent standalone Cash In remains separate from Cash In/Out', () {
    final dashboard = File(
      'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
    ).readAsStringSync();

    final customisation = File(
      'lib/features/ussd_settings/quick_action_customization_screen.dart',
    ).readAsStringSync();

    final preferences = File(
      'lib/features/ussd_settings/quick_action_preference.dart',
    ).readAsStringSync();

    final transaction = File(
      'lib/features/transactions/transaction_screen.dart',
    ).readAsStringSync();

    expect(
      dashboard,
      contains("provider == 'mtn' && role == 'agent' && type == 'cash_in'"),
    );
    expect(dashboard, contains("? 'Cash In'"));
    expect(dashboard, contains("? 'Cash In/Out'"));
    expect(dashboard, contains('!isMtnAgentStandaloneCashIn'));

    expect(customisation, contains("definition.type == 'send_money'"));
    expect(customisation, contains("type: 'cash_in'"));
    expect(customisation, contains("displayLabel: 'Cash In'"));

    expect(preferences, contains('return cleaned;'));
    expect(preferences, isNot(contains('legacyCashInIndex')));

    expect(transaction, contains('bool get _isStandaloneMtnAgentCash'));
    expect(transaction, contains("_transactionType == 'send_money'"));
    expect(transaction, contains("_transactionType == 'cash_out'"));
    expect(transaction, contains("labelText: 'Agent Service Fee (GH₵)'"));
    expect(transaction, contains('onPressed: _loading ? null : _proceed'));
  });
}
