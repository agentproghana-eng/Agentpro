import 'package:flutter_test/flutter_test.dart';

import 'package:agent_pro_ghana/features/ussd_settings/quick_action_catalog.dart';

void main() {
  group('Server-Driven Transaction Catalog V1', () {
    test('parses role and schema version from server catalog', () {
      final catalog = QuickActionCatalog.fromCacheJson({
        'mode': 'business',
        'role': 'merchant',
        'schema_version': 1,
        'providers': const [],
      });

      expect(catalog.mode, 'business');
      expect(catalog.role, 'merchant');
      expect(catalog.schemaVersion, 1);
    });

    test('preserves V1 identity through cache serialization', () {
      final catalog = QuickActionCatalog.fromCacheJson({
        'mode': 'business',
        'role': 'evd',
        'schema_version': 1,
        'providers': const [],
      });

      final cached = catalog.toCacheJson();

      expect(cached['mode'], 'business');
      expect(cached['role'], 'evd');
      expect(cached['schema_version'], 1);

      final restored = QuickActionCatalog.fromCacheJson(cached);

      expect(restored.mode, 'business');
      expect(restored.role, 'evd');
      expect(restored.schemaVersion, 1);
    });

    test('legacy Business cache remains Agent-compatible', () {
      final catalog = QuickActionCatalog.fromCacheJson({
        'mode': 'business',
        'providers': const [],
      });

      expect(catalog.mode, 'business');
      expect(catalog.role, 'agent');
      expect(catalog.schemaVersion, 1);
    });

    test('legacy Personal cache remains Subscriber-compatible', () {
      final catalog = QuickActionCatalog.fromCacheJson({
        'mode': 'personal',
        'providers': const [],
      });

      expect(catalog.mode, 'personal');
      expect(catalog.role, 'subscriber');
      expect(catalog.schemaVersion, 1);
    });

    test('rejects a future unsupported schema', () {
      expect(
        () => QuickActionCatalog.fromCacheJson({
          'mode': 'business',
          'role': 'agent',
          'schema_version': 3,
          'providers': const [],
        }),
        throwsFormatException,
      );
    });

    test('rejects a role that crosses account-mode boundary', () {
      expect(
        () => QuickActionCatalog.fromCacheJson({
          'mode': 'personal',
          'role': 'merchant',
          'schema_version': 1,
          'providers': const [],
        }),
        throwsFormatException,
      );
    });
  });
}
