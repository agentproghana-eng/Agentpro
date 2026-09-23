import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final progress = File(
    'lib/features/transactions/transaction_progress_screen.dart',
  ).readAsStringSync();

  final migration = File(
    '../backend/migrations/035_seed_telecel_cash_in_flow.sql',
  ).readAsStringSync();

  test('Telecel Agent Cash In does not bypass resolved Flow Builder', () {
    expect(
      progress.contains('isTelecelDepositFlow'),
      isFalse,
    );

    expect(
      progress.contains(
        'if (isMtnAccessibilityFlow || isTelecelDepositFlow)',
      ),
      isFalse,
    );
  });

  test('MTN dedicated accessibility path remains intact', () {
    expect(
      progress.contains('final isMtnAccessibilityFlow'),
      isTrue,
    );

    expect(
      progress.contains('if (isMtnAccessibilityFlow)'),
      isTrue,
    );
  });

  test('Telecel Cash In flow requires Operator ID through flow action', () {
    expect(
      migration.contains("'cash_in'"),
      isTrue,
    );

    expect(
      migration.contains("'send_operator_id'"),
      isTrue,
    );
  });

  test('resolved flow execution uses protected credential boundary', () {
    expect(
      progress.contains(
        "'/ussd-flows/execution-credentials'",
      ),
      isTrue,
    );

    expect(
      progress.contains(
        "step['action'] == 'send_operator_id'",
      ),
      isTrue,
    );
  });

  test('plaintext profile Operator ID is not restored', () {
    expect(
      progress.contains("user['telecel_operator_id']"),
      isFalse,
    );

    expect(
      progress.contains('telecelOperatorId'),
      isFalse,
    );
  });
}
