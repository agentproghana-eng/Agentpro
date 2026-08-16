import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String readSource(String path) => File(path).readAsStringSync();

void main() {
  group('Business transaction form order', () {
    late String source;

    setUpAll(() {
      source = readSource(
        'lib/features/transactions/transaction_screen.dart',
      );
    });

    test('common fields follow required order', () {
      final phone = source.indexOf('// 1. PHONE NUMBER');
      final amount = source.indexOf('// 2. AMOUNT');
      final reference = source.indexOf('// 3. REFERENCE');
      final charges = source.indexOf('// 4. TRANSFER CHARGES');

      expect(phone, greaterThanOrEqualTo(0));
      expect(amount, greaterThan(phone));
      expect(reference, greaterThan(amount));
      expect(charges, greaterThan(reference));
    });

    test('normal phone fields are labelled Phone Number', () {
      expect(
        source,
        contains("label: 'Phone Number'"),
      );

      expect(
        source,
        isNot(contains("label: 'Recipient Phone Number'")),
      );

      expect(
        source,
        isNot(contains("'Enter Number'")),
      );
    });

    test('true provider identifiers keep specialized labels', () {
      expect(
        source,
        contains("label: 'Merchant ID'"),
      );

      expect(
        source,
        contains("'Agent Short Code'"),
      );
    });
  });
}
