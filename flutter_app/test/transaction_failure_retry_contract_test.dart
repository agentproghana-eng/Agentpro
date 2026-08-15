import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final progress = File(
    'lib/features/transactions/transaction_progress_screen.dart',
  ).readAsStringSync();

  final personal = File(
    'lib/features/transactions/personal_transaction_screen.dart',
  ).readAsStringSync();

  final business = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  test('result timestamp matches the actual outcome', () {
    expect(progress, contains('final resultTimeLabel = isSuccess'));
    expect(progress, contains("? 'Checked at'"));
    expect(progress, contains(": 'Failed at';"));
    expect(progress, contains('label: resultTimeLabel'));
    expect(progress, contains('value: _resultTimeLabel(resultTime)'));
    expect(progress, isNot(contains("label: 'Completed',")));
  });

  test('all completed result states capture a stable timestamp', () {
    expect(
      RegExp(r'_completed = true;').allMatches(progress).length,
      5,
    );
    expect(
      RegExp(r'_resultRecordedAt \?\?= DateTime\.now\(\);')
          .allMatches(progress)
          .length,
      5,
    );
  });

  test('only definite failed results expose financial retry actions', () {
    expect(progress, contains('bool get _canRetryDefiniteFailure'));
    expect(progress, contains('_outcome == USSDStatus.failed'));
    expect(progress, contains('_completedTransaction != null'));
    expect(
      progress,
      contains(
        '!_isAmbiguousMissingResult(_outcome, _failureReason)',
      ),
    );

    expect(progress, contains("label: 'Retry Now'"));
    expect(progress, contains("label: 'Edit & Retry'"));
    expect(progress, contains("context.pop('retry_now')"));
    expect(progress, contains("context.pop('edit_retry')"));

    final pendingBranch = progress.indexOf('] else if (isPending) ...[');
    final definiteFailureBranch =
        progress.indexOf('] else if (canRetryDefiniteFailure) ...[');

    expect(pendingBranch, greaterThanOrEqualTo(0));
    expect(definiteFailureBranch, greaterThan(pendingBranch));
  });

  test('ambiguous Business initiation keeps same-operation retry separate', () {
    expect(progress, contains("label: 'Retry Connection'"));
    expect(progress, contains('_startupInitiationRetryAvailable'));
    expect(progress, contains('_retryStartupInitiation()'));
    expect(progress, contains('client_operation_id must remain unchanged'));
  });

  test('personal form stays mounted and can repeat a confirmed failure', () {
    expect(
      RegExp(r'progressAction = await context\.push<String>')
          .allMatches(personal)
          .length,
      2,
    );
    expect(
      RegExp(r"progressAction == 'retry_now'").allMatches(personal).length,
      2,
    );
  });

  test('business form stays mounted and creates a fresh deliberate attempt',
      () {
    expect(
      RegExp(r'progressAction = await context\.push<String>')
          .allMatches(business)
          .length,
      2,
    );
    expect(
      RegExp(r"progressAction == 'retry_now'").allMatches(business).length,
      2,
    );
    expect(
      business,
      contains('final clientOperationId = const Uuid().v4();'),
    );
  });

  test('personal Send Money app bar is concise without duplicate Return', () {
    expect(
      personal,
      contains("'send_money_same_network' => 'Send Money'"),
    );
    expect(
      personal,
      contains("'send_money_cross_network' => 'Send Money'"),
    );
    expect(personal, isNot(contains("label: const Text('Return')")));
  });
}
