import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String source(String path) => File(path).readAsStringSync();

void main() {
  group('Final visual UI sweep contracts', () {
    test('in-app notifications use canonical destinations', () {
      final notifications = source(
        'lib/features/notifications/notifications_screen.dart',
      );

      expect(
        notifications,
        contains('notificationRouteForType('),
      );

      expect(
        notifications,
        contains('context.push<void>(route)'),
      );

      expect(
        notifications,
        contains('Icons.chevron_right_rounded'),
      );
    });

    test('subscription failure is recoverable', () {
      final subscription = source(
        'lib/features/subscription/subscription_screen.dart',
      );

      expect(
        subscription,
        contains('String? _loadError;'),
      );

      expect(
        subscription,
        contains("label: const Text('Try Again')"),
      );

      expect(
        subscription,
        contains(
          'Enter both the MoMo reference and the phone used to pay.',
        ),
      );
    });

    test('My Balance has consistent AT Money naming and retry', () {
      final balances = source(
        'lib/features/balances/my_balance_screen.dart',
      );

      expect(
        balances,
        contains("return 'AT Money';"),
      );

      expect(
        balances,
        contains("label: const Text('Try Again')"),
      );
    });

    test('Agent More uses the destination name My Balance', () {
      final agent = source(
        'lib/features/dashboard/agent_dashboard.dart',
      );

      expect(
        agent,
        contains("'My Balance'"),
      );

      expect(
        agent,
        contains("context.push('/my-balance')"),
      );

      expect(
        agent,
        isNot(contains("'Float Balance'")),
      );
    });

    test('every More tab confirms Sign Out', () {
      final paths = [
        'lib/features/dashboard/agent_dashboard.dart',
        'lib/features/dashboard/owner_dashboard.dart',
        'lib/features/dashboard/manager_dashboard.dart',
        'lib/features/dashboard/personal_more_tab.dart',
      ];

      for (final path in paths) {
        expect(
          source(path),
          contains('confirmSignOut(context)'),
          reason: path,
        );
      }

      expect(
        source('lib/shared/widgets/more_tile.dart'),
        contains('Future<bool> confirmSignOut'),
      );
    });
  });
}
