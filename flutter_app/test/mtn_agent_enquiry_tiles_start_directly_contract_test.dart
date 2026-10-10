import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final dashboard = File(
    'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
  ).readAsStringSync();

  test('agent Balance and Commission tiles start dialing directly', () {
    expect(
      dashboard,
      contains("final isAgentZeroInputEnquiry = role == 'agent' &&"),
    );
    expect(
      dashboard,
      contains('ZeroInputDirectExecutionPolicy.supportedTypes.contains(type)'),
    );
    final start = dashboard.indexOf('final directStart =');
    final end = dashboard.indexOf('tiles.add(', start);
    final block = dashboard.substring(start, end);
    expect(block, contains('isAgentZeroInputEnquiry'));
    expect(block, contains('variantResolved &&'));
    expect(block, contains('!isMtnAgentCashWorkspace &&'));
    expect(block, contains('!isTelecelMerchantBankTransfer'));
    expect(dashboard, contains("query['auto_start'] = '1'"));
  });
}
