import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final dashboard = File(
    'lib/features/dashboard/widgets/'
    'dashboard_quick_actions_section.dart',
  ).readAsStringSync();

  final transactions = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  group('MTN Agent action presentation', () {
    test('Cash In/Out uses the matching default dashboard icon', () {
      expect(
        dashboard,
        contains('isMtnAgentCashWorkspace'),
      );
      expect(
        dashboard,
        contains('Icons.swap_horiz_rounded'),
      );
      expect(
        dashboard,
        contains('quickActionIconFromKey('),
      );
    });

    test('Pay To buttons preserve their transaction handlers', () {
      final start = transactions.indexOf(
        'if (_isMtnPayToWorkspace) ...[',
      );
      expect(start, greaterThanOrEqualTo(0));

      final end = transactions.indexOf(
        '// Security/info notice',
        start,
      );
      expect(end, greaterThan(start));

      final block = transactions.substring(start, end);

      expect(block, contains("label: 'Agent'"));
      expect(block, contains("label: 'Merchant'"));
      expect(block, contains("'pay_to_agent'"));
      expect(block, contains("'merchant_payment'"));
      expect(
        RegExp(r'_proceed\(\);').allMatches(block).length,
        2,
      );
    });
  });
}
