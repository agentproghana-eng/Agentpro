import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _readSource(String path) {
  final file = File(path);

  expect(
    file.existsSync(),
    isTrue,
    reason: 'Expected production source file to exist: $path',
  );

  return file.readAsStringSync();
}

void main() {
  group('Personal mode access contracts', () {
    test(
      'router blocks Personal workspace routes when capability is absent',
      () {
        final source = _readSource('lib/core/router/app_router.dart');
        final normalizedSource = source.replaceAll(RegExp(r'\s+'), ' ');

        // The mobile router must mirror the backend Personal-capability
        // boundary. A Business-only account may not enter any /personal-*
        // workspace route merely by deep-linking to it.
        expect(
          normalizedSource,
          contains(
            'final hasPersonalCapability = '
            "authState.user['personal_subscription_plan'] != null;",
          ),
          reason:
              'Router must derive Personal capability from authenticated user state.',
        );

        expect(
          normalizedSource,
          contains(
            "if (location.startsWith('/personal-') && "
            '!hasPersonalCapability)',
          ),
          reason:
              'Every /personal-* route must be blocked when Personal capability is absent.',
        );
      },
    );

    test(
      'Settings rebuilds when Personal capability is added to AuthBloc',
      () {
        final source =
            _readSource('lib/features/settings/settings_screen.dart');

        final buildStart = source.indexOf('Widget build(BuildContext context)');
        expect(
          buildStart,
          greaterThanOrEqualTo(0),
          reason: 'SettingsScreen build method must exist.',
        );

        final scaffoldStart = source.indexOf('return Scaffold(', buildStart);
        expect(
          scaffoldStart,
          greaterThan(buildStart),
          reason: 'SettingsScreen Scaffold must follow its build method.',
        );

        final buildPrologue = source.substring(buildStart, scaffoldStart);

        expect(
          buildPrologue,
          contains('context.watch<AuthBloc>().state'),
          reason:
              'Settings must subscribe to AuthBloc so Add Personal Account disappears immediately after capability is added.',
        );

        expect(
          buildPrologue,
          isNot(contains('context.read<AuthBloc>().state')),
          reason:
              'A non-listening AuthBloc read leaves Settings stale after AuthUpdateUserEvent.',
        );
      },
    );
  });
}
