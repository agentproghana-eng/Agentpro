import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String readSource(String path) => File(path).readAsStringSync();

void main() {
  group('MTN Personal cross-network Send Money', () {
    late String source;

    setUpAll(() {
      source = readSource(
        'lib/features/transactions/'
        'personal_transaction_screen.dart',
      );
    });

    test('provides all six live-confirmed recipient networks', () {
      for (final entry in {
        "'1': 'AT'",
        "'2': 'Telecel'",
        "'3': 'E-zwich'",
        "'4': 'G-Money'",
        "'5': 'Zeepay'",
        "'6': 'GhanaPay'",
      }) {
        expect(source, contains(entry));
      }
    });

    test('requires recipient network selection', () {
      expect(
        source,
        contains("labelText: 'Recipient Network'"),
      );

      expect(
        source,
        contains("'Recipient network is required'"),
      );
    });

    test('passes network digit through send_selection input', () {
      expect(
        source,
        contains("'selections_in_order'"),
      );

      expect(
        source,
        contains('_crossNetworkSelection!'),
      );
    });

    test('cross-network MTN reference is required', () {
      final start = source.indexOf('bool get _referenceRequired');

      final end = source.indexOf('bool get _needsTillNumber');

      expect(start, greaterThanOrEqualTo(0));
      expect(end, greaterThan(start));

      final section = source.substring(start, end);

      expect(
        section,
        contains("'send_money_cross_network'"),
      );
    });
  });
}
