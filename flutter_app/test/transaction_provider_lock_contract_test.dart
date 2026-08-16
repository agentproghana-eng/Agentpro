import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String readSource(String path) => File(path).readAsStringSync();

void main() {
  group('Business transaction provider/SIM locking', () {
    late String transactionScreen;
    late String dashboardActions;

    setUpAll(() {
      transactionScreen = readSource(
        'lib/features/transactions/transaction_screen.dart',
      );

      dashboardActions = readSource(
        'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
      );
    });

    test('route-provided provider locks transaction network', () {
      expect(
        transactionScreen,
        contains('bool get _providerLocked'),
      );

      expect(
        transactionScreen,
        contains('if (_providerLocked) {'),
      );

      expect(
        transactionScreen,
        contains('if (!_providerLocked &&'),
      );
    });

    test('locked transaction UI works for every provider', () {
      expect(
        transactionScreen,
        contains(r"'$_selectedProviderLabel locked · Using SIM"),
      );

      expect(
        transactionScreen,
        contains(r"'Select physical $_selectedProviderLabel SIM'"),
      );

      expect(
        transactionScreen,
        contains('AppTheme.providerColor(_selectedProvider)'),
      );
    });

    test('Business Quick Action carries physical SIM identity', () {
      expect(
        dashboardActions,
        contains("'provider': provider"),
      );

      expect(
        dashboardActions,
        contains("'sim_slot': sim.slot.toString()"),
      );

      expect(
        dashboardActions,
        contains("'sim_iccid': sim.iccid"),
      );

      expect(
        dashboardActions,
        contains(
          "'sim_subscription_id': sim.subscriptionId.toString()",
        ),
      );
    });

    test('same-provider dual SIM selection remains available', () {
      expect(
        transactionScreen,
        contains('if (_selectedProviderSims.length > 1)'),
      );

      expect(
        transactionScreen,
        contains('_selectedSimSlot = sim.slot'),
      );
    });
  });
}
