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
  group('Google Play consumption-only distribution', () {
    test('distribution flag defaults to non-Play', () {
      final source = _source(
        'lib/core/config/distribution_channel.dart',
      );

      expect(
        source,
        contains('AGENTPRO_PLAY_STORE_BUILD'),
      );

      expect(
        source,
        contains('defaultValue: false'),
      );
    });

    test('Play AAB enables the Play distribution flag', () {
      final source = _source('../.github/workflows/ci.yml');

      expect(
        source,
        contains(
          '--dart-define=AGENTPRO_PLAY_STORE_BUILD=true',
        ),
      );
    });

    test(
      'subscription purchases are consumption-only in Play builds',
      () {
        for (final path in [
          'lib/features/subscription/subscription_screen.dart',
          'lib/features/subscription/personal_subscription_screen.dart',
        ]) {
          final source = _source(path);

          expect(
            source,
            contains('distribution_channel.dart'),
          );

          expect(
            source,
            contains('if (kPlayStoreBuild) {'),
          );

          expect(
            source,
            contains('if (!kPlayStoreBuild) {'),
          );

          expect(
            source,
            contains(
              'Purchases and renewals are not available',
            ),
          );

          // Non-Play distributions intentionally retain the existing
          // Paystack flow.
          expect(
            source,
            contains('Pay with Paystack'),
          );
        }
      },
    );

    test(
      'Marketplace listing payment is hidden in Play builds',
      () {
        final source = _source(
          'lib/features/marketplace/ad_detail_screen.dart',
        );

        expect(
          source,
          contains('distribution_channel.dart'),
        );

        expect(
          source,
          contains('!kPlayStoreBuild'),
        );

        expect(
          source,
          contains(
            'Listing payments are not available in',
          ),
        );

        // Direct APK/web-compatible source keeps the existing provider
        // flow for non-Play distribution.
        expect(
          source,
          contains('Paystack Payment'),
        );
      },
    );
  });
}
