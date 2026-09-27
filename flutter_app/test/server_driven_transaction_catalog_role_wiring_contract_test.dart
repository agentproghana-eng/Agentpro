import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String path) {
  final file = File(path);
  expect(file.existsSync(), isTrue);
  return file.readAsStringSync();
}

void main() {
  group('Server-Driven Transaction Catalog V1 role wiring', () {
    test('Home loads and caches all operational SIM role catalogs', () {
      final source = _read(
        'lib/features/dashboard/home_tab.dart',
      );

      expect(source, contains('_evdQuickActionCatalog'));
      expect(source, contains('_merchantQuickActionCatalog'));
      expect(source, contains('_evdQuickActionCatalogResolved'));
      expect(source, contains('_merchantQuickActionCatalogResolved'));

      expect(source, contains("loadCatalog(mode: 'agent')"));
      expect(source, contains("loadCatalog(mode: 'subscriber')"));
      expect(source, contains("loadCatalog(mode: 'evd')"));
      expect(source, contains("loadCatalog(mode: 'merchant')"));

      expect(source, contains("'evd_catalog'"));
      expect(source, contains("'merchant_catalog'"));

      expect(source, contains('evdCatalog: _evdQuickActionCatalog'));
      expect(
        source,
        contains('merchantCatalog: _merchantQuickActionCatalog'),
      );
    });

    test('dashboard resolves a dedicated catalog for every SIM role', () {
      final source = _read(
        'lib/features/dashboard/widgets/'
        'dashboard_quick_actions_section.dart',
      );

      expect(source, contains("'subscriber' => subscriberCatalog"));
      expect(source, contains("'evd' => evdCatalog"));
      expect(source, contains("'merchant' => merchantCatalog"));
      expect(source, contains("'agent' => agentCatalog"));

      expect(source, contains("'evd' => evdCatalogResolved"));
      expect(
        source,
        contains("'merchant' => merchantCatalogResolved"),
      );

      expect(
        source,
        contains(
          "if ((role == 'evd' || role == 'merchant') && "
          "fallback.isNotEmpty)",
        ),
      );
    });

    test(
      'Telecel Merchant fallback remains rollout-only and Agent is never inherited',
      () {
        final source = _read(
          'lib/features/dashboard/widgets/'
          'dashboard_quick_actions_section.dart',
        );

        expect(source, contains('telecelMerchantDefaults'));
        expect(source, contains('hasServerCatalogActions'));
        expect(
          source,
          contains(
            'Never inherit Agent actions across SIM roles.',
          ),
        );
      },
    );
  });
}
