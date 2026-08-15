import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String readSource(String path) => File(path).readAsStringSync();

void main() {
  group('Global-flow Quick Action catalog contracts', () {
    late String customizer;
    late String catalog;
    late String home;
    late String personalHome;
    late String dashboardActions;

    setUpAll(() {
      customizer = readSource(
        'lib/features/ussd_settings/quick_action_customization_screen.dart',
      );
      catalog = readSource(
        'lib/features/ussd_settings/quick_action_catalog.dart',
      );
      home = readSource(
        'lib/features/dashboard/home_tab.dart',
      );
      personalHome = readSource(
        'lib/features/dashboard/personal_home_screen.dart',
      );
      dashboardActions = readSource(
        'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
      );
    });

    test('customizer loads the authenticated mode-aware Quick Action catalog',
        () {
      expect(
        catalog,
        contains('/users/me/quick-actions/catalog'),
      );

      expect(
        catalog,
        contains('mode'),
      );

      expect(
        customizer,
        contains('QuickActionCatalog.load'),
      );
    });

    test('customizer no longer owns a closed provider support matrix', () {
      expect(customizer, isNot(contains('kAgentQuickActionSupport')));
      expect(customizer, isNot(contains('kPersonalQuickActionSupport')));

      expect(
        customizer,
        isNot(
          contains(
            "for (final provider in ['mtn', 'telecel', 'at_money'])",
          ),
        ),
      );

      expect(
        customizer,
        isNot(
          contains('Quick Actions for MTN, Telecel, and AT Money.'),
        ),
      );
    });

    test('customizer does not render three fixed provider buttons', () {
      expect(
        customizer,
        isNot(contains("label: 'MTN',\n                      value: 'mtn'")),
      );
      expect(
        customizer,
        isNot(
          contains(
            "label: 'Telecel',\n                      value: 'telecel'",
          ),
        ),
      );
      expect(
        customizer,
        isNot(
          contains(
            "label: 'AT Money',\n                      value: 'at_money'",
          ),
        ),
      );
    });

    test('dashboard preference parsing accepts provider keys dynamically', () {
      expect(
        home,
        isNot(
          contains(
            "for (final provider in ['mtn', 'telecel', 'at_money'])",
          ),
        ),
      );

      expect(
        personalHome,
        isNot(
          contains(
            "for (final provider in ['mtn', 'telecel', 'at_money'])",
          ),
        ),
      );
    });

    test('Personal Home no longer owns a fixed provider catalog', () {
      expect(
        personalHome,
        isNot(
          contains(
            'final _providers = const [',
          ),
        ),
      );
    });

    test(
        'Quick Action definitions come from catalog data, not a closed type list',
        () {
      expect(
        catalog,
        contains('quick_action_group'),
      );

      expect(
        catalog,
        contains('display_label'),
      );

      expect(
        customizer,
        contains('QuickActionCatalogDefinition'),
      );

      expect(
        dashboardActions,
        isNot(contains('kAgentQuickActionDefinitions')),
      );

      expect(
        dashboardActions,
        isNot(contains('kPersonalQuickActionDefinitions')),
      );
    });

    test('dynamic catalog actions keep the generic transaction navigation path',
        () {
      expect(
        dashboardActions,
        contains('/transactions?type=\$type&provider=\$provider'),
      );

      expect(
        dashboardActions,
        contains("path: '/personal-transactions/new'"),
      );
    });

    test('unknown providers retain readable fallback labels', () {
      expect(
        dashboardActions,
        contains('quickActionProviderLabel(value)'),
      );

      expect(
        catalog,
        contains('_ => _humanizeCatalogValue(value)'),
      );
    });

    test('saved future transaction types remain visible in Personal Home', () {
      expect(
        personalHome,
        isNot(
          contains('_quickActionDefinition(item.actionKey) != null'),
        ),
      );

      expect(
        personalHome,
        contains('quickActionTransactionLabel('),
      );
    });

    test('saved preferences load independently from catalog metadata', () {
      expect(
        customizer,
        isNot(contains('final results = await Future.wait([')),
      );

      expect(
        customizer,
        contains("ApiClient.instance.get('/users/me/quick-actions')"),
      );

      expect(
        customizer,
        contains('QuickActionCatalog.load(mode: mode)'),
      );
    });

    test('saved future providers remain available when the catalog is stale',
        () {
      expect(
        customizer,
        contains('...saved.keys'),
      );

      expect(
        personalHome,
        contains('..._personalQuickActions.keys'),
      );
    });

    test('customizer keeps controls usable for saved future transaction types',
        () {
      expect(
        customizer,
        isNot(contains('if (definition == null) return;')),
      );

      expect(
        customizer,
        contains('quickActionTransactionLabel(preference.actionKey)'),
      );
    });

    test('customizer preserves saved future transaction types', () {
      expect(
        customizer,
        isNot(contains('final allowedTypes =')),
      );

      expect(
        customizer,
        isNot(contains('!allowedTypes.contains(')),
      );

      expect(
        customizer,
        isNot(contains('_definitionFor(preference.actionKey)!')),
      );
    });
  });
}
