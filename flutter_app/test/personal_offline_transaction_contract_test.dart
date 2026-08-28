import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String path) {
  final file = File(path);

  expect(
    file.existsSync(),
    isTrue,
    reason: 'Expected source file: $path',
  );

  return file.readAsStringSync();
}

String _slice(
  String source,
  String start,
  String end,
) {
  final startIndex = source.indexOf(start);
  expect(startIndex, greaterThanOrEqualTo(0));

  final endIndex = source.indexOf(end, startIndex);
  expect(endIndex, greaterThan(startIndex));

  return source.substring(startIndex, endIndex);
}

void main() {
  group('Personal offline transaction contracts', () {
    late String transactionSource;
    late String personalHomeSource;

    setUpAll(() {
      transactionSource = _read(
        'lib/features/transactions/personal_transaction_screen.dart',
      );

      personalHomeSource = _read(
        'lib/features/dashboard/personal_home_screen.dart',
      );
    });

    test(
      'offline Personal initiation bypasses the server POST and supplies cached flow',
      () {
        final helper = _slice(
          transactionSource,
          'Future<String?> _startPreparedPersonalTransaction',
          'Future<void> _submit() async',
        );

        final connectivity =
            helper.indexOf('Connectivity().checkConnectivity()');

        final offlineBranch = helper.indexOf('if (isOffline)');

        final serverPost = helper.indexOf(
          'ApiClient.instance.post(\n'
          "          '/personal-transactions'",
        );

        expect(connectivity, greaterThanOrEqualTo(0));
        expect(offlineBranch, greaterThan(connectivity));
        expect(serverPost, greaterThan(offlineBranch));

        expect(
          helper,
          contains(
            'OfflineQueueService.getCachedFlow(',
          ),
        );

        expect(
          helper,
          contains('isPersonal: true'),
        );

        expect(
          helper,
          contains("'cached_flow': cachedFlow"),
        );

        expect(
          helper,
          contains("'transaction_id': localId"),
        );

        expect(
          helper,
          contains("'automation_entitled': true"),
        );

        expect(
          helper,
          contains('await OfflineQueueService.init();'),
        );
      },
    );

    test(
      'cached Personal overrides require the same user and an active Paid plan',
      () {
        final helper = _slice(
          transactionSource,
          'Future<String?> _startPreparedPersonalTransaction',
          'Future<void> _submit() async',
        );

        expect(
          helper,
          contains(
            'ownerUserId != identity.userId',
          ),
        );

        expect(
          helper,
          contains(
            '!trust.hasPersonalPaidEntitlement',
          ),
        );

        expect(
          helper,
          contains(
            "cachedFlow['company_id']",
          ),
        );
      },
    );

    test(
      'offline request preserves stable client operation and exact SIM identity',
      () {
        expect(
          transactionSource,
          contains(
            "request['client_operation_id'] = "
            '_pendingClientOperationId',
          ),
        );

        final helper = _slice(
          transactionSource,
          'Future<String?> _startPreparedPersonalTransaction',
          'Future<void> _submit() async',
        );

        expect(
          helper,
          contains("'sim_slot': selectedSim.slot"),
        );

        expect(
          helper,
          contains(
            "'sim_subscription_id': "
            'selectedSim.subscriptionId',
          ),
        );

        expect(
          helper,
          contains("'request_fields': requestFields"),
        );
      },
    );

    test(
      'Personal transaction form uses identity-bound Subscriber role trust',
      () {
        final load = _slice(
          transactionSource,
          'Future<void> _loadSimIdentity() async',
          '@override\n  void dispose()',
        );

        expect(
          load,
          contains(
            'SimRoleAssignmentService.rolesForSims',
          ),
        );

        expect(
          load,
          contains(
            'refreshFromServer: true',
          ),
        );

        final roleService = _read(
          'lib/core/services/'
          'sim_role_assignment_service.dart',
        );

        expect(
          roleService,
          contains(
            'simIccid: sim.iccid',
          ),
        );

        expect(
          roleService,
          contains(
            'simSubscriptionId: sim.subscriptionId',
          ),
        );

        expect(
          roleService,
          contains(
            'provider: sim.network',
          ),
        );

        expect(
          load,
          contains(
            "purposes[sim.slot] == 'subscriber'",
          ),
        );

        expect(
          load,
          isNot(
            contains(
              "purposes[sim.slot] != 'agent'",
            ),
          ),
        );
      },
    );
    test(
      'Personal Home preloads scoped flow variants for offline Quick Actions',
      () {
        final preload = _slice(
          personalHomeSource,
          'Future<void> _preloadPersonalQuickActionFlows',
          'Future<void> _loadQuickActions() async',
        );

        expect(
          preload,
          contains(
            "'/personal-ussd-flows/resolve'",
          ),
        );

        expect(
          preload,
          contains(
            'OfflineQueueService.cacheFlow(',
          ),
        );

        expect(
          preload,
          contains('isPersonal: true'),
        );

        expect(
          preload,
          contains('variant.bundleCategory'),
        );

        expect(
          preload,
          contains('variant.recipientMode'),
        );

        expect(
          preload,
          contains('await OfflineQueueService.init();'),
        );

        expect(
          preload,
          contains(
            'OfflineQueueService.deleteCachedFlow(',
          ),
        );

        expect(
          preload,
          contains('statusCode == 429'),
        );
      },
    );
  });
}
