import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final form = File(
    'lib/features/transactions/transaction_screen.dart',
  ).readAsStringSync();

  final progress = File(
    'lib/features/transactions/transaction_progress_screen.dart',
  ).readAsStringSync();

  group('MTN Cash In/Out progress result exits', () {
    test('both progress launches carry workspace flag', () {
      expect(
        RegExp(
          "'mtn_cash_in_out_workspace': "
          "_isMtnCashInOutWorkspace",
        ).allMatches(form).length,
        2,
      );
    });

    test('progress recognizes MTN workspace only', () {
      expect(
        progress,
        contains(
          "widget.data['mtn_cash_in_out_workspace'] == true",
        ),
      );

      expect(
        progress,
        contains(
          "widget.data['provider']?.toString() == 'mtn'",
        ),
      );
    });

    test('success returns success', () {
      expect(
        progress,
        contains("workspaceAction: 'success'"),
      );
    });

    test('pending remains pending', () {
      expect(
        progress,
        contains(
          "workspaceAction: 'pending_confirmation'",
        ),
      );
    });

    test('failure returns failed without clearing form', () {
      expect(
        RegExp(
          "workspaceAction: 'failed'",
        ).allMatches(progress).length,
        3,
      );
    });

    test('workspace uses pop while ordinary flow uses home', () {
      final start = progress.indexOf(
        'void _finishResult({',
      );

      final end = progress.indexOf(
        'bool _isRetryableInitiationError',
        start,
      );

      expect(start, greaterThan(-1));
      expect(end, greaterThan(start));

      final block = progress.substring(start, end);

      expect(
        block,
        contains('if (_isPersistentBusinessWorkspace)'),
      );

      expect(
        block,
        contains('context.pop(workspaceAction)'),
      );

      expect(
        block,
        contains(
          '_returnHome(refreshDashboard: refreshDashboard)',
        ),
      );
    });

    test('cancel retry and pending semantics remain distinct', () {
      expect(
        progress,
        contains("context.pop('cancelled');"),
      );
      expect(
        progress,
        contains("context.pop('retry_now');"),
      );
      expect(
        progress,
        contains("context.pop('edit_retry');"),
      );
      expect(
        progress,
        contains(
          "context.pop('pending_confirmation');",
        ),
      );
    });
  });
}
