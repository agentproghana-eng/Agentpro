import 'dart:io';

import 'package:agent_pro_ghana/shared/utils/transaction_labels.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  visualSurfaceSourceContracts();

  group('Transaction Detail display semantics', () {
    test('provider-specific transaction terminology stays consistent', () {
      expect(
        transactionTypeLabel('send_money', 'mtn'),
        'Cash In',
      );

      expect(
        transactionTypeLabel('cash_in', 'telecel'),
        'Deposit',
      );

      expect(
        transactionTypeLabel('cash_out', 'telecel'),
        'Withdrawal',
      );

      expect(
        transactionTypeLabel('pay_to_agent', 'mtn'),
        'Pay to Agent',
      );

      expect(
        transactionTypeLabel('merchant_payment', 'mtn'),
        'Pay to Merchant',
      );
    });

    test('Transaction Detail uses shared display terminology', () {
      final source = File(
        'lib/features/transactions/transaction_detail_screen.dart',
      ).readAsStringSync();

      expect(
        source,
        contains('transactionTypeLabel('),
      );

      expect(
        source,
        contains(
          "(_tx!['provider'] ?? '').toString()",
        ),
      );
    });
  });
}

void visualSurfaceSourceContracts() {
  test('Progress and Offline Sync use shared transaction labels', () {
    final progress = File(
      'lib/features/transactions/transaction_progress_screen.dart',
    ).readAsStringSync();

    final sync = File(
      'lib/features/sync/sync_queue_screen.dart',
    ).readAsStringSync();

    expect(
      progress,
      contains('transactionTypeLabel(rawType, provider)'),
    );

    expect(
      sync,
      contains('transactionTypeLabel(rawType, provider)'),
    );

    expect(
      progress,
      isNot(contains('String _resultTitleCase(')),
    );
  });

  test('History and Reports use canonical visible payment labels', () {
    final history = File(
      'lib/features/transactions/transaction_history_screen.dart',
    ).readAsStringSync();

    final reports = File(
      'lib/features/reports/reports_screen.dart',
    ).readAsStringSync();

    expect(
      history,
      contains(
        "{'value': 'merchant_payment', 'label': 'Pay to Merchant'}",
      ),
    );

    expect(
      reports,
      contains(
        "{'value': 'merchant_payment', 'label': 'Pay to Merchant'}",
      ),
    );

    expect(
      history,
      contains(
        "{'value': 'balance_enquiry', 'label': 'Check Balance'}",
      ),
    );

    expect(
      reports,
      contains(
        "{'value': 'balance_enquiry', 'label': 'Check Balance'}",
      ),
    );
  });
}
