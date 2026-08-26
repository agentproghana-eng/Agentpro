import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _source(String path) {
  final file = File(path);

  expect(
    file.existsSync(),
    isTrue,
    reason: 'Expected source file to exist: $path',
  );

  return file.readAsStringSync();
}

void main() {
  group('Professional compact UI contracts', () {
    test('Settings tiles stay compact and descriptions are capped', () {
      final source = _source('lib/features/settings/settings_screen.dart');

      expect(
        source,
        contains(
            'Sign in without internet using your phone PIN, password or biometrics.'),
      );

      expect(source, contains('visualDensity: const VisualDensity('));

      expect(source, contains('maxLines: 2'));
      expect(source, contains('overflow: TextOverflow.ellipsis'));
    });

    test(
      'Quick Actions keep provider labels visible and hide metadata behind tooltips',
      () {
        final source = _source(
          'lib/features/ussd_settings/'
          'quick_action_customization_screen.dart',
        );

        expect(source, contains('_selectedActionTooltip'));

        expect(source, contains('tooltip: _selectedActionTooltip('));

        expect(
          source,
          contains('constraints: const BoxConstraints(minWidth: 96)'),
        );

        expect(source, contains('maxLines: 2'));
      },
    );

    test(
      'Float balances use explicit provider badges and metadata tooltips',
      () {
        final source = _source('lib/features/float/float_screen.dart');

        expect(source, contains('String _providerShortLabel'));

        expect(source, contains("'mtn' => 'MTN'"));

        expect(source, contains("'telecel' => 'Telecel'"));

        expect(source, contains("'at_money' => 'AT Money'"));

        expect(
          source,
          contains(
            'Business branch treasury balances. '
            'Separate from each agent',
          ),
        );

        expect(source, contains('Tooltip('));
        expect(source, contains('maxLines: 2'));
      },
    );
  });
}
