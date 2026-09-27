import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final transaction = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  test('remote values use fixed semantic keys', () {
    expect(
      transaction,
      contains('_serverDrivenSubmissionKeys'),
    );

    for (final key in [
      'customer_phone',
      'recipient_phone',
      'amount',
      'account_number',
      'merchant_id',
      'reference',
      'operator_id',
    ]) {
      expect(transaction, contains("'$key'"));
    }

    expect(
      transaction,
      isNot(contains('..._serverDrivenFormValues')),
    );
  });

  test('one normalized builder creates transaction requests', () {
    expect(
      transaction,
      contains(
        'Map<String, dynamic> _buildTransactionRequestFields',
      ),
    );

    expect(
      transaction,
      contains("'amount': _effectiveAmount"),
    );

    expect(
      transaction,
      contains(
        "'customer_phone': _effectiveCustomerPhone",
      ),
    );

    expect(
      transaction,
      contains(
        "'account_number': _effectiveAccountNumber",
      ),
    );

    expect(
      transaction,
      contains(
        "'payment_reference': _effectiveReference",
      ),
    );
  });

  test('high amount warning uses normalized amount', () {
    expect(
      transaction,
      contains(
        'final amountForWarning = _effectiveAmount;',
      ),
    );
  });

  test('both progress paths use normalized values', () {
    expect(
      RegExp(
        r"'amount': _effectiveAmountText",
      ).allMatches(transaction).length,
      2,
    );

    expect(
      RegExp(
        r"'customer_phone': _effectiveCustomerPhone",
      ).allMatches(transaction).length,
      greaterThanOrEqualTo(3),
    );
  });

  test('remote values cannot be spread into request body', () {
    expect(
      transaction,
      isNot(contains('..._serverDrivenFormValues')),
    );
  });
}
