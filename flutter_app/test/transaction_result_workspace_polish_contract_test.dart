import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final form = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  final progress = File(
    'lib/features/transactions/transaction_progress_screen.dart',
  ).readAsStringSync();

  group('transaction result and MTN workspace polish', () {
    test('workspace keeps one phone field for Cash In and Cash Out', () {
      expect(
        form,
        contains(
          "_isMtnCashInOutWorkspace || ['send_money'].contains(_transactionType)",
        ),
      );

      expect(
        form,
        contains(
          'bool get _needsCustomer =>\n'
          '      !_isMtnCashInOutWorkspace &&',
        ),
      );

      expect(
        form,
        contains(
          "'customer_phone': _isMtnCashInOutWorkspace",
        ),
      );

      expect(
        form,
        contains(
          '? _recipientPhoneCtrl.text.trim()',
        ),
      );
    });

    test('only success clears MTN workspace inputs', () {
      expect(
        form,
        contains(
          "if (_isMtnCashInOutWorkspace ||\n"
          "        _isTelecelMerchantECashWorkspace) {\n"
          "      if (action == 'success') {\n"
          "        _clearTransactionInputsAfterSuccess();",
        ),
      );
    });

    test('service fee input appears before simplified checkbox', () {
      final input =
          form.indexOf("labelText: 'Agent Service Fee (GH₵)'");
      final checkbox =
          form.indexOf("'Charge agent service fee'");

      expect(input, greaterThanOrEqualTo(0));
      expect(checkbox, greaterThan(input));

      expect(
        form,
        isNot(
          contains(
            'Select to calculate 1%. You can edit the calculated fee.',
          ),
        ),
      );

      expect(
        form,
        isNot(
          contains('1% automatic calculation • manually editable'),
        ),
      );

      expect(form, isNot(contains("'No service fee'")));
    });

    test('result amount is smaller but result phone stays prominent', () {
      final amount = progress.indexOf(
        "'GH₵ \${parsedAmount.toStringAsFixed(2)}'",
      );

      expect(amount, greaterThanOrEqualTo(0));

      final amountBlock = progress.substring(
        amount,
        (amount + 300).clamp(0, progress.length),
      );

      expect(amountBlock, contains('fontSize: 22'));

      final phone = progress.indexOf(
        'SelectableText(\n'
        '                    customerPhone',
      );

      expect(phone, greaterThanOrEqualTo(0));

      final phoneBlock = progress.substring(
        phone,
        (phone + 300).clamp(0, progress.length),
      );

      expect(phoneBlock, contains('fontSize: 30'));
    });

    test('processing screen shows amount and phone', () {
      expect(progress, contains('final processingAmountLabel ='));
      expect(
        progress,
        contains(
          "'GH₵ \${processingAmount.toStringAsFixed(2)}'",
        ),
      );
      expect(
        progress,
        contains('if (processingAmountLabel.isNotEmpty)'),
      );
      expect(
        progress,
        contains('if (processingPhone.isNotEmpty)'),
      );
    });

    test('transaction form amount typography was not changed to 22', () {
      final amount =
          form.indexOf("labelText: 'Amount (GH₵)'");

      expect(amount, greaterThanOrEqualTo(0));

      final block = form.substring(
        amount,
        (amount + 900).clamp(0, form.length),
      );

      expect(block, isNot(contains('fontSize: 22')));
    });
  });
}
