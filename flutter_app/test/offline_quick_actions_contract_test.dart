import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String path) {
  final file = File(path);
  expect(file.existsSync(), isTrue);
  return file.readAsStringSync();
}

String _slice(String source, String start, String end) {
  final startIndex = source.indexOf(start);
  final endIndex = source.indexOf(end, startIndex);

  expect(startIndex, greaterThanOrEqualTo(0));
  expect(endIndex, greaterThan(startIndex));

  return source.substring(startIndex, endIndex);
}

void main() {
  group('Offline Quick Action contracts', () {
    test('dashboard snapshot is encrypted and account scoped', () {
      final source = _read('lib/core/services/storage_service.dart');

      expect(source, contains('offline_dashboard_v1_'));
      expect(source, contains('FlutterSecureStorage'));
      expect(source, contains('getOfflineDashboardSnapshot'));
      expect(source, contains('mergeOfflineDashboardSnapshot'));
      expect(source, contains("user['id']"));
      expect(source, contains("user['company_id']"));
    });

    test('business dashboard restores durable data before network', () {
      final source = _read('lib/features/dashboard/home_tab.dart');

      final load = _slice(
        source,
        'Future<void> _loadQuickActions({',
        'Future<void> _loadSimPurposes() async',
      );

      final durableIndex = load.indexOf('getOfflineDashboardSnapshot');

      final networkIndex = load.indexOf(
        "ApiClient.instance.get('/users/me/quick-actions')",
      );

      expect(durableIndex, greaterThanOrEqualTo(0));
      expect(networkIndex, greaterThan(durableIndex));

      expect(load, contains("'business_catalog'"));
      expect(load, contains("'personal_catalog'"));
      expect(load, contains("'quick_actions'"));
    });

    test(
      'business restores identity-bound SIM roles and disabled actions offline',
      () {
        final source = _read(
          'lib/features/dashboard/home_tab.dart',
        );

        final purposes = _slice(
          source,
          'Future<void> _loadSimPurposes() async',
          'Future<void> _loadFeatureFlags() async',
        );

        final flags = _slice(
          source,
          'Future<void> _loadFeatureFlags() async',
          'Future<void> _loadSimMap() async',
        );

        expect(
          purposes,
          contains(
            'SimRoleAssignmentService.rolesForSims',
          ),
        );

        final roleService = _read(
          'lib/core/services/'
          'sim_role_assignment_service.dart',
        );

        expect(
          roleService,
          contains('simIccid: sim.iccid'),
        );

        expect(
          roleService,
          contains(
            'simSubscriptionId: sim.subscriptionId',
          ),
        );

        expect(
          roleService,
          contains('provider: sim.network'),
        );

        expect(
          flags,
          contains('getOfflineDashboardSnapshot'),
        );

        expect(
          flags,
          contains("'disabled_transaction_types'"),
        );
      },
    );

    test(
      'Personal restores actions and requires trusted Subscriber SIM role',
      () {
        final source = _read(
          'lib/features/dashboard/personal_home_screen.dart',
        );

        final actions = _slice(
          source,
          'Future<void> _loadQuickActions({',
          'QuickActionCatalogDefinition? _quickActionDefinition',
        );

        expect(
          actions,
          contains('getOfflineDashboardSnapshot'),
        );

        expect(
          actions,
          contains('QuickActionCatalog.fromCacheJson'),
        );

        final simLoad = _slice(
          source,
          'Future<void> _loadSimMap() async',
          'void _startTransaction(String type)',
        );

        expect(
          simLoad,
          contains(
            'SimRoleAssignmentService.rolesForSims',
          ),
        );

        expect(
          simLoad,
          contains(
            "purposes[sim.slot] == 'subscriber'",
          ),
        );

        final roleService = _read(
          'lib/core/services/'
          'sim_role_assignment_service.dart',
        );

        expect(
          roleService,
          contains('simIccid: sim.iccid'),
        );

        expect(
          roleService,
          contains(
            'simSubscriptionId: sim.subscriptionId',
          ),
        );

        expect(
          roleService,
          contains('provider: sim.network'),
        );
      },
    );

    test('catalog supports durable round trip', () {
      final source = _read(
        'lib/features/ussd_settings/quick_action_catalog.dart',
      );

      expect(source, contains('toCacheJson()'));
      expect(source, contains('fromCacheJson('));
    });
  });
}
