import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final transaction = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  final submission = File(
    'lib/features/transactions/'
    'server_driven_transaction_submission.dart',
  ).readAsStringSync();

  test(
    'remote values use a dedicated fixed semantic allowlist',
    () {
      expect(
        transaction,
        contains(
          "import 'server_driven_transaction_submission.dart';",
        ),
      );

      expect(
        transaction,
        contains('ServerDrivenTransactionSubmission('),
      );

      for (final key in <String>[
        'customer_phone',
        'recipient_phone',
        'amount',
        'account_number',
        'merchant_id',
        'reference',
        'operator_id',
      ]) {
        expect(
          submission,
          contains("'$key'"),
          reason: '$key must remain explicitly allowlisted',
        );
      }

      expect(
        transaction,
        isNot(contains('..._serverDrivenFormValues')),
      );
    },
  );

  test(
    'one normalized adapter creates server-driven request fields',
    () {
      expect(
        submission,
        contains('Map<String, dynamic> toRequestFields()'),
      );

      expect(
        submission,
        contains("'amount': amount"),
      );
      expect(
        submission,
        contains("'customer_phone': customerPhone"),
      );
      expect(
        submission,
        contains("'recipient_phone': recipientPhone"),
      );
      expect(
        submission,
        contains("'account_number': accountNumber"),
      );
      expect(
        submission,
        contains("'payment_reference': reference"),
      );
      expect(
        submission,
        contains("'merchant_id': merchantId"),
      );

      expect(
        transaction,
        contains(
          '_serverDrivenSubmission.toRequestFields()',
        ),
      );
    },
  );

  test(
    'both progress paths use the same normalized request map',
    () {
      // One request map is built for the offline branch and one for the
      // online branch. Each progress route receives that same normalized
      // map as request_fields/automation_params instead of rebuilding
      // server-driven values independently.
      expect(
        RegExp(
          r'final requestFields = '
          r'_buildTransactionRequestFields\(',
        ).allMatches(transaction).length,
        greaterThanOrEqualTo(2),
      );

      expect(
        RegExp(
          r"'request_fields': requestFields",
        ).allMatches(transaction).length,
        greaterThanOrEqualTo(2),
      );

      expect(
        transaction,
        contains("'automation_params': requestFields"),
      );
    },
  );

  test(
    'remote schema cannot control sensitive or accounting fields',
    () {
      for (final forbidden in <String>[
        "'pin'",
        "'password'",
        "'otp'",
        "'ledger_account'",
        "'posting_policy'",
        "'balance'",
        "'commission'",
      ]) {
        expect(
          submission,
          isNot(contains(forbidden)),
          reason: '$forbidden must not be remotely mapped',
        );
      }
    },
  );
}
