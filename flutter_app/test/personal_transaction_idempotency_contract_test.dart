import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Personal transactions retain one stable operation UUID across retries',
      () {
    final source = File(
      'lib/features/transactions/personal_transaction_screen.dart',
    ).readAsStringSync();

    expect(source, contains("import 'package:uuid/uuid.dart';"));
    expect(
      source,
      contains('StorageService.getOrCreateInstallationId()'),
    );
    expect(source, contains('_pendingClientOperationId'));
    expect(source, contains('_pendingClientOperationFingerprint'));
    expect(source, contains('_resetClientOperationForNewAttempt'));
    expect(source, contains("progressAction == 'edit_retry'"));
    expect(source, contains("'client_operation_id'"));
    expect(source, contains("'installation_id'"));
    expect(source, contains("'selections_in_order'"));

    // Definition + MashUp + generic transaction + data bundle.
    expect(
      RegExp(r'_withStableClientOperation\(').allMatches(source).length,
      greaterThanOrEqualTo(4),
    );
  });

  test('Personal backend requires and persists the operation identity', () {
    final route = File(
      '../backend/src/routes/personalTransaction.routes.js',
    ).readAsStringSync();

    final controller = File(
      '../backend/src/controllers/personalTransactionController.js',
    ).readAsStringSync();

    final migration = File(
      '../backend/migrations/085_personal_transaction_idempotency.sql',
    ).readAsStringSync();

    expect(route, contains("body('client_operation_id')"));
    expect(route, contains('.isUUID()'));

    expect(controller, contains('buildPersonalOperationFingerprint'));
    expect(controller, contains('CLIENT_OPERATION_CONFLICT'));
    expect(
      controller,
      contains(
        'idx_personal_transactions_user_client_operation',
      ),
    );

    expect(
      migration,
      contains(
        'idx_personal_transactions_user_client_operation',
      ),
    );
    expect(
      migration,
      contains('chk_personal_transaction_operation_pair'),
    );
  });
}
