import 'dart:io';

import 'package:agent_pro_ghana/core/services/offline_queue_service.dart';
import 'package:agent_pro_ghana/features/ussd_flows/ussd_flow_runtime_policy.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';

void main() {
  group('Custom USSD online cache policy', () {
    test('network failure may fall back to cache', () {
      expect(
        shouldFallbackToCachedUssdFlow(
          hasHttpResponse: false,
        ),
        isTrue,
      );
    });

    test('transient HTTP failures may fall back to cache', () {
      for (final status in [408, 429, 500, 502, 503]) {
        expect(
          shouldFallbackToCachedUssdFlow(
            hasHttpResponse: true,
            statusCode: status,
          ),
          isTrue,
          reason: 'HTTP $status should permit temporary cache fallback',
        );
      }
    });

    test('authoritative 4xx responses cannot be bypassed by cache', () {
      for (final status in [400, 401, 403, 404, 409, 422]) {
        expect(
          shouldFallbackToCachedUssdFlow(
            hasHttpResponse: true,
            statusCode: status,
          ),
          isFalse,
          reason: 'HTTP $status must not run stale cached automation',
        );
      }
    });
  });

  group('Custom USSD cache revocation', () {
    late Directory hiveDirectory;

    const identity = OfflineQueueIdentity(
      userId: 'user-1',
      companyId: 'company-1',
    );

    setUp(() async {
      hiveDirectory = await Directory.systemTemp.createTemp(
        'agentpro_custom_ussd_cache_test_',
      );

      Hive.init(hiveDirectory.path);

      await Hive.openBox('offline_transaction_queue');
      await Hive.openBox('cached_ussd_templates');
    });

    tearDown(() async {
      await Hive.close();

      if (await hiveDirectory.exists()) {
        await hiveDirectory.delete(recursive: true);
      }
    });

    test('deleting one variant preserves another variant', () async {
      const flexiFlow = <String, dynamic>{
        'dial_code': '*100#',
        'steps': [
          {
            'match_all': ['bundle'],
            'action': 'pin_prompt',
          },
        ],
      };

      const fixedFlow = <String, dynamic>{
        'dial_code': '*101#',
        'steps': [
          {
            'match_all': ['bundle'],
            'action': 'pin_prompt',
          },
        ],
      };

      await OfflineQueueService.cacheFlow(
        'telecel',
        'data_bundle',
        flexiFlow,
        identity: identity,
        bundleCategory: 'flexi',
      );

      await OfflineQueueService.cacheFlow(
        'telecel',
        'data_bundle',
        fixedFlow,
        identity: identity,
        bundleCategory: 'fixed',
      );

      await OfflineQueueService.deleteCachedFlow(
        'telecel',
        'data_bundle',
        identity: identity,
        bundleCategory: 'flexi',
      );

      expect(
        OfflineQueueService.getCachedFlow(
          'telecel',
          'data_bundle',
          identity: identity,
          bundleCategory: 'flexi',
        ),
        isNull,
      );

      expect(
        OfflineQueueService.getCachedFlow(
          'telecel',
          'data_bundle',
          identity: identity,
          bundleCategory: 'fixed',
        ),
        fixedFlow,
      );
    });
  });

  group('Transaction progress integration contract', () {
    test('offline cache and online resolution remain separate', () {
      final source = File(
        'lib/features/transactions/transaction_progress_screen.dart',
      ).readAsStringSync();

      final supplied = source.indexOf(
        "final suppliedCachedFlow = transaction['cached_flow'];",
      );

      final online = source.indexOf(
        'Online-started transactions must ask the server',
      );

      expect(supplied, greaterThanOrEqualTo(0));
      expect(online, greaterThan(supplied));

      expect(
        source,
        contains('if (suppliedCachedFlow is Map)'),
      );

      expect(
        source,
        contains(
          'await OfflineQueueService.deleteCachedFlow(',
        ),
      );

      expect(
        source,
        contains('shouldFallbackToCachedUssdFlow('),
      );

      expect(
        source,
        contains(
          'final flowValidationError = validateUssdFlowDraftSteps(steps);',
        ),
      );

      expect(
        source,
        contains(
          'final metadataValidationError = validateUssdFlowDraftMetadata(',
        ),
      );

      expect(
        source,
        contains("errorCode == 'USSD_FLOW_INVALID_CONFIGURATION'"),
      );

      expect(
        source,
        isNot(
          contains(
            'unawaited(\n        _refreshCachedFlow(',
          ),
        ),
      );
    });
  });
}
