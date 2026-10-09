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
    test('transaction emphasis preserves 30px for non-compact fields', () {
      expect(
        widgets,
        contains('compactTransactionField ? 21 : 30'),
      );
    });

    test('non-compact transaction fields retain 30px values', () {
      expect(
        widgets,
        contains('(compactTransactionField ? 21 : 30)'),
      );
      expect(
        widgets,
        contains('this.compactTransactionField = false'),
      );
    });

    test('compact transaction styling is opt-in', () {
      expect(
        widgets,
        contains('this.compactTransactionField = false'),
      );
      expect(
        widgets,
        contains('compactTransactionField ? 21 : 30'),
      );
    });

    test('compact business styling is restricted to MTN Agent', () {
      expect(
        business,
        contains("bool get _compactMtnAgentForm =>"),
      );
      expect(
        business,
        contains("_selectedProvider == 'mtn' &&"),
      );
      expect(
        business,
        contains("_selectedBusinessSimRole == 'agent';"),
      );
    });

    test('reference can use a smaller 20px entered-value size', () {
      expect(
        widgets,
        contains('final double? transactionValueFontSize;'),
      );

      expect(
        widgets,
        contains('this.transactionValueFontSize,'),
      );
    });

    test('business phone uses MTN Agent-only compact styling', () {
      final phoneStart =
          business.indexOf('controller: _customerPhoneCtrl');

      expect(phoneStart, greaterThan(-1));

      final before = business.substring(
        phoneStart > 150 ? phoneStart - 150 : 0,
        phoneStart,
      );

      expect(before, contains('transactionEmphasis: true'));
      expect(
        before,
        contains('compactTransactionField: _compactMtnAgentForm'),
      );
      expect(before, isNot(contains('transactionValueFontSize:')));
    });

    test('business amount is 21px for MTN Agent, 30px otherwise', () {
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

      expect(
        block,
        contains('fontSize: _compactMtnAgentForm ? 21 : 30'),
      );
      expect(block, contains('fontWeight: FontWeight.bold'));
      expect(
        block,
        contains('contentPadding: _compactMtnAgentForm'),
      );
    });

    test('business reference entered value is 20px', () {
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
        contains('transactionValueFontSize: 20'),
      );
    });

    test('personal reference entered value is 20px', () {
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
        contains('transactionValueFontSize: 20'),
      );
    });
  });
}
