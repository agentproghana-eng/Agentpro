import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String path) {
  return File(path).readAsStringSync();
}

void main() {
  group('AgentPro Privacy Policy contracts', () {
    test('Settings exposes the public privacy policy', () {
      final settings = _read(
        'lib/features/settings/settings_screen.dart',
      );

      expect(
        settings,
        contains(
          'package:url_launcher/url_launcher.dart',
        ),
      );

      expect(
        settings,
        contains("title: 'Privacy Policy'"),
      );

      expect(
        settings,
        contains(
          'https://admin.agentpro.intellicoresystem.com/privacy-policy/',
        ),
      );

      expect(
        settings,
        contains('LaunchMode.externalApplication'),
      );

      expect(
        settings,
        contains('_openPrivacyPolicy'),
      );
    });

    test('public policy identifies operator and contact', () {
      final page = _read(
        '../admin_portal/public/privacy-policy/index.html',
      );

      final normalized = page.toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

      expect(
        normalized,
        contains('agentpro privacy policy'),
      );

      expect(
        normalized,
        contains('intellicore system'),
      );

      expect(
        normalized,
        contains('support@intellicoresystem.com'),
      );
    });

    test('public policy covers implemented data categories', () {
      final page = _read(
        '../admin_portal/public/privacy-policy/index.html',
      );

      final normalized = page.toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

      for (final phrase in <String>[
        'account and business information',
        'device, installation and sim information',
        'transaction and financial records',
        'mobile money pins',
        'accessibility service',
        'microphone',
        'firebase',
        'google mobile ads',
        'paystack',
        'cloudinary',
        'resend',
        'arkesel',
        'free-trial abuse prevention',
        'retention and account deletion',
        'financial and transaction records',
        'security and audit records',
      ]) {
        expect(
          normalized,
          contains(phrase),
          reason: 'Missing privacy disclosure: $phrase',
        );
      }
    });

    test('policy links account deletion and collects no secrets', () {
      final page = _read(
        '../admin_portal/public/privacy-policy/index.html',
      );

      final lower = page.toLowerCase();

      expect(
        page,
        contains('href="/account-deletion/"'),
      );

      expect(
        lower,
        isNot(contains('<script')),
      );

      expect(
        lower,
        isNot(contains('<form')),
      );

      expect(
        lower,
        isNot(contains('type="password"')),
      );
    });

    test('policy matches current permission boundaries', () {
      final page = _read(
        '../admin_portal/public/privacy-policy/index.html',
      );

      final normalized = page.toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

      expect(
        normalized,
        contains(
          'does not request device location permission',
        ),
      );

      expect(
        normalized,
        contains(
          'does not request android camera permission',
        ),
      );

      expect(
        normalized,
        contains(
          'does not request device location permission or address-book/contact permission',
        ),
      );
    });
  });
}
