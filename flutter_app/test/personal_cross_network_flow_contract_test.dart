import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String readSource(String path) => File(path).readAsStringSync();

String sourceSlice(
  String source,
  String startMarker,
  String endMarker,
) {
  final start = source.indexOf(startMarker);
  final end = source.indexOf(endMarker, start + 1);

  expect(start, greaterThanOrEqualTo(0));
  expect(end, greaterThan(start));

  return source.substring(start, end);
}

void main() {
  late String source;

  setUpAll(() {
    source = readSource(
      'lib/features/transactions/'
      'personal_transaction_screen.dart',
    );
  });

  group('MTN Personal cross-network Send Money', () {
    test('keeps all six live-confirmed recipient networks', () {
      final section = sourceSlice(
        source,
        '_mtnCrossNetworkOptions',
        '_telecelCrossNetworkOptions',
      );

      for (final entry in {
        "'1': 'AT'",
        "'2': 'Telecel'",
        "'3': 'E-zwich'",
        "'4': 'G-Money'",
        "'5': 'Zeepay'",
        "'6': 'GhanaPay'",
      }) {
        expect(section, contains(entry));
      }
    });
  });

  group('Telecel Personal cross-network Send Money', () {
    test('provides exactly the four live-confirmed networks', () {
      final section = sourceSlice(
        source,
        '_telecelCrossNetworkOptions',
        'String? _crossNetworkSelection',
      );

      for (final entry in {
        "'1': 'MTN'",
        "'2': 'ATMoney'",
        "'3': 'G-Money'",
        "'4': 'GhanaPay'",
      }) {
        expect(section, contains(entry));
      }

      expect(section, isNot(contains("'5':")));
    });

    test('unified Telecel transfer exposes Same and Other Network', () {
      expect(
        source,
        contains(
          'bool get _requiresSendMoneyModeChoice => _isUnifiedSendMoney;',
        ),
      );

      expect(
        source,
        isNot(contains('_isTelecelUnifiedSendMoney')),
      );

      expect(
        source,
        contains(
          "'other_network' => 'send_money_cross_network'",
        ),
      );
    });

    test('uses the provider-aware recipient-network selector', () {
      expect(
        source,
        contains('bool get _isTelecelCrossNetwork =>'),
      );

      expect(
        source,
        contains('bool get _isCrossNetwork =>'),
      );

      expect(
        source,
        contains('if (_isCrossNetwork) ...['),
      );

      expect(
        source,
        contains('items: _crossNetworkOptions.entries'),
      );

      expect(
        source,
        contains(
          "'Choose the destination network shown by \$_providerLabel'",
        ),
      );
    });

    test('passes the selected network digit through transaction selections', () {
      final selectionHelper = sourceSlice(
        source,
        'List<String>? get _transactionSelectionsInOrder {',
        'bool get _isMtnAirtime =>',
      );

      expect(
        selectionHelper,
        contains('if (_isCrossNetwork &&'),
      );

      expect(
        selectionHelper,
        contains('_crossNetworkSelection != null'),
      );

      expect(
        selectionHelper,
        contains('return <String>[_crossNetworkSelection!];'),
      );

      expect(
        source,
        contains(
          'final selectionsInOrder = _transactionSelectionsInOrder;',
        ),
      );

      expect(
        source,
        contains('if (selectionsInOrder != null)'),
      );

      expect(
        source,
        contains(
          "'selections_in_order': selectionsInOrder",
        ),
      );
    });

    test('requires a reference for Telecel cross-network transfer', () {
      final section = sourceSlice(
        source,
        'bool get _referenceRequired',
        'bool get _needsTillNumber',
      );

      expect(
        section,
        contains("widget.provider == 'telecel'"),
      );

      expect(
        section,
        contains("'send_money_cross_network'"),
      );
    });

    test('recipient network selection remains required', () {
      expect(
        source,
        contains("labelText: 'Recipient Network'"),
      );

      expect(
        source,
        contains("'Recipient network is required'"),
      );
    });
  });
}
