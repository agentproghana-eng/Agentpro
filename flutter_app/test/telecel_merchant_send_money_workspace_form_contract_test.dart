import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  test(
    'Telecel Merchant Send Money owns its grouped workspace form',
    () {
      final start = source.indexOf(
        'bool get _usesServerDrivenForm',
      );
      expect(start, greaterThanOrEqualTo(0));

      final end = source.indexOf(
        'void _updateServerDrivenFormValues',
        start,
      );
      expect(end, greaterThan(start));

      final section = source.substring(start, end);

      expect(
        section,
        contains('_isTelecelMerchantSendMoneyWorkspace'),
      );
      expect(
        section,
        contains('return false;'),
      );
    },
  );

  test(
    'Merchant Send Money workspace requires recipient amount and reference',
    () {
      final recipientStart = source.indexOf(
        'bool get _needsRecipient',
      );
      final recipientEnd = source.indexOf(
        'bool get _needsReference',
        recipientStart,
      );

      expect(recipientStart, greaterThanOrEqualTo(0));
      expect(recipientEnd, greaterThan(recipientStart));

      final recipientSection = source.substring(
        recipientStart,
        recipientEnd,
      );

      expect(
        recipientSection,
        contains('_isTelecelMerchantSendMoneyWorkspace'),
      );

      final amountStart = source.indexOf(
        'bool get _needsAmount',
      );
      final amountEnd = source.indexOf(
        'bool get _isTelecelAirtimeSelf',
        amountStart,
      );

      expect(amountStart, greaterThanOrEqualTo(0));
      expect(amountEnd, greaterThan(amountStart));

      final amountSection = source.substring(
        amountStart,
        amountEnd,
      );

      expect(
        amountSection,
        isNot(contains("'send_money_same_network'")),
      );
      expect(
        amountSection,
        isNot(contains("'send_money_cross_network'")),
      );

      final referenceStart = source.indexOf(
        'bool get _needsTelecelMerchantReference',
      );
      final referenceEnd = source.indexOf(
        'bool get _needsTelecelMerchantAccountNumber',
        referenceStart,
      );

      expect(referenceStart, greaterThanOrEqualTo(0));
      expect(referenceEnd, greaterThan(referenceStart));

      final referenceSection = source.substring(
        referenceStart,
        referenceEnd,
      );

      expect(
        referenceSection,
        contains('_isTelecelMerchantSendMoneyWorkspace'),
      );
    },
  );

  test(
    'Merchant Send Money preserves exact backend identities',
    () {
      final typeStart = source.indexOf(
        'String get _transactionType',
      );
      final typeEnd = source.indexOf(
        'bool get _isTelecelMerchantSendMoneyWorkspace',
        typeStart,
      );

      expect(typeStart, greaterThanOrEqualTo(0));
      expect(typeEnd, greaterThan(typeStart));

      final section = source.substring(
        typeStart,
        typeEnd,
      );

      expect(
        section,
        contains("'send_money_same_network'"),
      );
      expect(
        section,
        contains("'send_money_cross_network'"),
      );
    },
  );
}
