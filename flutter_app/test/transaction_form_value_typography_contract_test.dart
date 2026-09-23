import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final widgets = File(
    'lib/shared/widgets/app_widgets.dart',
  ).readAsStringSync();

  final business = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  final personal = File(
    'lib/features/transactions/personal_transaction_screen.dart',
  ).readAsStringSync();

  group('transaction form value typography', () {
    test('transaction emphasis keeps phone values at 30px by default', () {
      expect(
        widgets,
        contains('fontSize: transactionValueFontSize ?? 30'),
      );
    });

    test('reference can use a smaller entered-value size', () {
      expect(
        widgets,
        contains('final double? transactionValueFontSize;'),
      );

      expect(
        widgets,
        contains('this.transactionValueFontSize,'),
      );
    });

    test('business phone keeps normal 30px transaction emphasis', () {
      final phoneStart =
          business.indexOf('controller: _customerPhoneCtrl');

      expect(phoneStart, greaterThan(-1));

      final before = business.substring(
        phoneStart > 150 ? phoneStart - 150 : 0,
        phoneStart,
      );

      expect(before, contains('transactionEmphasis: true'));
      expect(before, isNot(contains('transactionValueFontSize:')));
    });

    test('business amount is 30px bold', () {
      final amountStart =
          business.indexOf('controller: _amountCtrl');

      expect(amountStart, greaterThan(-1));

      final amountEnd = business.indexOf(
        'validator:',
        amountStart,
      );

      final block = business.substring(
        amountStart,
        amountEnd,
      );

      expect(block, contains('fontSize: 30'));
      expect(block, contains('fontWeight: FontWeight.bold'));
      expect(block, isNot(contains('fontSize: 20')));
    });

    test('business reference entered value is 28px', () {
      final refStart =
          business.indexOf('controller: _referenceCtrl');

      expect(refStart, greaterThan(-1));

      final before = business.substring(
        refStart > 180 ? refStart - 180 : 0,
        refStart,
      );

      expect(before, contains('transactionEmphasis: true'));
      expect(
        before,
        contains('transactionValueFontSize: 28'),
      );
    });

    test('personal reference entered value is 28px', () {
      final refStart =
          personal.indexOf('controller: _referenceCtrl');

      expect(refStart, greaterThan(-1));

      final before = personal.substring(
        refStart > 180 ? refStart - 180 : 0,
        refStart,
      );

      expect(before, contains('transactionEmphasis: true'));
      expect(
        before,
        contains('transactionValueFontSize: 28'),
      );
    });
  });
}
