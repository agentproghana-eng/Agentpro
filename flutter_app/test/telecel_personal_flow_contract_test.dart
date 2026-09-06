import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/personal_transaction_screen.dart',
  ).readAsStringSync();

  group('Telecel Personal flow UI contract', () {
    test('unified Telecel Transfer Money resolves only to same network', () {
      expect(
        source,
        contains(
          "bool get _isTelecelUnifiedSendMoney =>",
        ),
      );

      expect(
        source,
        contains(
          "_isUnifiedSendMoney && widget.provider == 'telecel'",
        ),
      );

      expect(
        source,
        contains(
          "if (_isTelecelUnifiedSendMoney) {",
        ),
      );

      expect(
        source,
        contains(
          "return 'send_money_same_network';",
        ),
      );

      expect(
        source,
        contains(
          "if (_requiresSendMoneyModeChoice) ...[",
        ),
      );
    });

    test('requires reference for Telecel same-network Send Money', () {
      expect(
        source,
        contains("widget.provider == 'telecel'"),
      );

      expect(
        source,
        contains("type == 'send_money_same_network'"),
      );
    });

    test('offers only recovered Daily category for Telecel Buy Data', () {
      expect(
        source,
        contains('List<DataBundleCategory> get _availableDataBundleCategories'),
      );

      expect(
        source,
        contains("category.id == 'daily'"),
      );

      expect(
        source,
        contains(
          'children: _availableDataBundleCategories.map((cat) {',
        ),
      );
    });
  });
}
