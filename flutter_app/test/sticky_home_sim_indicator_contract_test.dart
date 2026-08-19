import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'Business Home keeps the SIM provider selector above scrollable content',
    () {
      final source = File(
        'lib/features/dashboard/home_tab.dart',
      ).readAsStringSync();

      final header = source.indexOf('DashboardHeader(');
      final selector = source.indexOf('DashboardProviderSelector(');
      final scroll = source.indexOf('CustomScrollView(');

      expect(header, greaterThanOrEqualTo(0));
      expect(selector, greaterThan(header));
      expect(scroll, greaterThan(selector));

      final scrollingSection = source.substring(scroll);

      expect(
        scrollingSection.contains('DashboardProviderSelector('),
        isFalse,
      );
    },
  );

  test(
    'Personal Home keeps provider and physical SIM selectors above scroll',
    () {
      final source = File(
        'lib/features/dashboard/personal_home_screen.dart',
      ).readAsStringSync();

      final scaffold = source.indexOf('return Scaffold(');

      expect(scaffold, greaterThanOrEqualTo(0));

      final fixedIndicators = source.indexOf(
        '_buildFrozenSimIndicators(',
        scaffold,
      );

      final scroll = source.indexOf(
        'child: CustomScrollView(',
        scaffold,
      );

      expect(fixedIndicators, greaterThan(scaffold));
      expect(scroll, greaterThan(fixedIndicators));

      final scrollingSection = source.substring(scroll);

      expect(
        scrollingSection.contains('visibleProviders.map((p)'),
        isFalse,
      );

      expect(
        scrollingSection.contains(
          'if (_selectedProviderSims.length > 1)',
        ),
        isFalse,
      );
    },
  );

  test(
    'Personal physical SIM buttons remain accessible and selectable',
    () {
      final source = File(
        'lib/features/dashboard/personal_home_screen.dart',
      ).readAsStringSync();

      final helperStart = source.indexOf(
        'Widget _buildFrozenSimIndicators(',
      );

      final dispose = source.indexOf(
        '@override\n  void dispose()',
        helperStart,
      );

      expect(helperStart, greaterThanOrEqualTo(0));
      expect(dispose, greaterThan(helperStart));

      final helper = source.substring(
        helperStart,
        dispose,
      );

      expect(helper, contains('Semantics('));
      expect(helper, contains('selected: selected'));
      expect(helper, contains('button: true'));
      expect(helper, contains('_selectPhysicalSim(sim)'));
    },
  );
}
