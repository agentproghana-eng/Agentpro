import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  late String dashboard;

  setUpAll(() {
    dashboard = File(
      'lib/features/dashboard/widgets/'
      'dashboard_quick_actions_section.dart',
    ).readAsStringSync();
  });

  test('Telecel Merchant defaults expose Data', () {
    expect(
      dashboard,
      contains("role == 'merchant' && provider == 'telecel'"),
    );

    expect(
      dashboard,
      contains("'data_bundle'"),
    );
  });

  test('Telecel Merchant keeps its existing business workspaces', () {
    for (final type in <String>[
      'airtime',
      'data_bundle',
      'balance_enquiry',
      'send_money',
      'float_to_working',
      'send_money_to_bank',
    ]) {
      expect(
        dashboard,
        contains("'$type'"),
        reason: 'Missing Telecel Merchant action: $type',
      );
    }
  });
}
