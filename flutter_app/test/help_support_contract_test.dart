import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String readSource(String relativePath) {
  return File(relativePath).readAsStringSync();
}

void main() {
  group('Help and Support contracts', () {
    test('More screens pass the active account mode into Support', () {
      final personal = readSource(
        'lib/features/dashboard/personal_more_tab.dart',
      );

      expect(
        personal,
        contains("context.push('/support?mode=personal')"),
      );

      for (final path in <String>[
        'lib/features/dashboard/owner_dashboard.dart',
        'lib/features/dashboard/manager_dashboard.dart',
        'lib/features/dashboard/agent_dashboard.dart',
      ]) {
        final source = readSource(path);

        expect(
          source,
          contains("context.push('/support?mode=business')"),
          reason: '$path must open Support in Agent-SIM mode.',
        );
      }
    });

    test('Support route forwards the requested mode to SupportScreen', () {
      final router = readSource(
        'lib/core/router/app_router.dart',
      );

      expect(router, contains("path: '/support'"));

      expect(
        router,
        contains("state.uri.queryParameters['mode']"),
      );

      expect(
        router,
        contains('SupportScreen('),
      );

      expect(
        router,
        contains('isPersonal:'),
      );
    });

    test('support contacts have shared Personal and Agent sources of truth',
        () {
      final constants = readSource(
        'lib/core/constants/app_constants.dart',
      );

      expect(
        constants,
        contains(
          "static const String supportPhone = '0207438990';",
        ),
      );

      expect(
        constants,
        contains(
          "static const String supportWhatsAppNumber = '233207438990';",
        ),
      );

      expect(
        constants,
        contains(
          'static const String supportHours =',
        ),
      );

      expect(
        constants,
        contains(
          'personalProviderSupportNumbers',
        ),
      );

      expect(
        constants,
        contains(
          'agentProviderSupportNumbers',
        ),
      );

      expect(
        constants,
        contains("'mtn': '100'"),
        reason: 'Personal MTN support uses 100.',
      );

      expect(
        constants,
        contains("'mtn': '114'"),
        reason: 'MTN Agent SIM support uses 114.',
      );

      expect(constants, contains("'telecel': '100'"));
      expect(constants, contains("'at_money': '100'"));
    });

    test('Support screen chooses contacts using active account mode', () {
      final source = readSource(
        'lib/features/support/support_screen.dart',
      );

      expect(
        source,
        contains(
          '../../core/constants/app_constants.dart',
        ),
      );

      expect(source, contains('final bool isPersonal'));

      expect(
        source,
        contains(
          'AppConstants.personalProviderSupportNumbers',
        ),
      );

      expect(
        source,
        contains(
          'AppConstants.agentProviderSupportNumbers',
        ),
      );

      expect(source, contains('AppConstants.supportEmail'));
      expect(source, contains('AppConstants.supportPhone'));

      expect(
        source,
        contains('AppConstants.supportWhatsAppNumber'),
      );

      expect(source, contains('AppConstants.supportHours'));

      expect(
        source,
        isNot(contains("number: '114'")),
      );

      expect(
        source,
        isNot(contains("'support@intellicoresystem.com'")),
      );

      expect(
        source,
        isNot(contains("'0207438990'")),
      );

      expect(
        source,
        isNot(contains("'233207438990'")),
      );
    });

    test('Support external actions visibly report launch failures', () {
      final source = readSource(
        'lib/features/support/support_screen.dart',
      );

      expect(
        source,
        isNot(contains('canLaunchUrl(')),
        reason: 'launchUrl return values must be checked directly.',
      );

      expect(
        source,
        contains('launchUrl('),
      );

      expect(
        source,
        contains(
          'ScaffoldMessenger.of(context).showSnackBar',
        ),
        reason:
            'Unavailable phone, mail, or WhatsApp apps must not fail silently.',
      );
    });

    test('Settings preserves active mode when opening Support', () {
      final personal = readSource(
        'lib/features/dashboard/personal_more_tab.dart',
      );
      final owner = readSource(
        'lib/features/dashboard/owner_dashboard.dart',
      );
      final manager = readSource(
        'lib/features/dashboard/manager_dashboard.dart',
      );
      final agent = readSource(
        'lib/features/dashboard/agent_dashboard.dart',
      );
      final router = readSource(
        'lib/core/router/app_router.dart',
      );
      final settings = readSource(
        'lib/features/settings/settings_screen.dart',
      );

      expect(
        personal,
        contains("context.push('/settings?mode=personal')"),
      );

      for (final source in <String>[owner, manager, agent]) {
        expect(
          source,
          contains("context.push('/settings?mode=business')"),
        );
      }

      expect(
        router,
        contains("path: '/settings'"),
      );

      expect(
        router,
        contains(
          "isPersonal: state.uri.queryParameters['mode'] == 'personal'",
        ),
      );

      expect(
        settings,
        contains('final bool isPersonal'),
      );

      expect(
        settings,
        contains("'/support?mode=personal'"),
      );

      expect(
        settings,
        contains("'/support?mode=business'"),
      );

      expect(
        settings,
        isNot(contains("scheme: 'mailto'")),
      );
    });

    test('Help Guide explains Personal versus Agent SIM network support', () {
      final source = readSource(
        'lib/features/support/help_guide_screen.dart',
      );

      expect(
        source,
        contains('MTN Personal'),
      );

      expect(
        source,
        contains('100'),
      );

      expect(
        source,
        contains('MTN Agent SIM'),
      );

      expect(
        source,
        contains('114'),
      );

      expect(
        source,
        contains('Telecel'),
      );

      expect(
        source,
        contains('AT Money'),
      );
    });

    test('Help Guide does not freeze a closed transaction catalog', () {
      final source = readSource(
        'lib/features/support/help_guide_screen.dart',
      );

      expect(
        source,
        isNot(
          contains(
            'Cash In, Cash Out, Send Money, Pay to Merchant, '
            'Pay to Agent, Airtime, Data Bundle, Balance Enquiry, '
            'and Mini Statement',
          ),
        ),
      );

      expect(
        source,
        isNot(contains('configured remotely by an admin')),
      );

      expect(
        source,
        isNot(contains('built into the app itself')),
      );

      expect(
        source,
        contains(
          'currently available for your provider and account mode',
        ),
      );

      expect(
        source,
        isNot(
          contains('capability configuration'),
        ),
      );
    });

    test('Help Guide reflects current balance terminology', () {
      final source = readSource(
        'lib/features/support/help_guide_screen.dart',
      );

      expect(
        source,
        isNot(
          contains('What are the three balance types?'),
        ),
      );

      expect(
        source,
        contains('Working Account'),
      );

      expect(
        source,
        contains('Float or e-Float'),
      );

      expect(
        source,
        isNot(
          contains(
            'Tap "Transfer Commission to e-Float".',
          ),
        ),
      );
    });

    test('Help Guide reflects current Business and Personal billing', () {
      final source = readSource(
        'lib/features/support/help_guide_screen.dart',
      );

      expect(
        source,
        isNot(contains('GH₵10/month')),
      );

      expect(
        source,
        contains('GH₵10 per paid active seat'),
      );

      expect(
        source,
        contains('Every 5th active staff member'),
      );

      expect(
        source,
        contains('GH₵5/month'),
        reason: 'The shared guide is also available to Personal users.',
      );
    });

    test('Help Guide reflects secure staff password setup', () {
      final source = readSource(
        'lib/features/support/help_guide_screen.dart',
      );

      expect(
        source,
        contains(
          'secure one-time password setup link by email',
        ),
      );

      expect(
        source,
        contains(
          'No password is sent by email, SMS, or push notification',
        ),
      );

      expect(
        source,
        contains(
          'setup link expires after one hour',
        ),
      );

      expect(
        source,
        contains(
          'use Forgot Password',
        ),
      );

      expect(
        source.toLowerCase(),
        isNot(contains('temporary password')),
      );
    });

    test('Help Guide reflects mobile Custom USSD Flow ownership', () {
      final source = readSource(
        'lib/features/support/help_guide_screen.dart',
      );

      expect(
        source,
        isNot(
          contains(
            'In the Admin Portal (web), not the mobile app',
          ),
        ),
      );

      expect(
        source,
        contains('Custom USSD Flows'),
      );

      expect(
        source,
        contains('Business owners'),
      );

      expect(
        source,
        contains('Personal users'),
      );

      expect(
        source,
        contains('Global flows'),
      );
    });

    test('Help Guide reflects required marketplace photos', () {
      final source = readSource(
        'lib/features/support/help_guide_screen.dart',
      );

      expect(
        source,
        contains('at least one photo is required'),
      );

      expect(
        source,
        isNot(
          contains('Photos are optional'),
        ),
      );
    });

    test('Help Guide uses current phone-authentication wording', () {
      final source = readSource(
        'lib/features/support/help_guide_screen.dart',
      );

      expect(
        source,
        isNot(
          contains(
            'Can I log in with my fingerprint or face?',
          ),
        ),
      );

      expect(
        source,
        contains('phone authentication'),
      );
    });

    test('Help Guide distinguishes Business and Personal report formats', () {
      final source = readSource(
        'lib/features/support/help_guide_screen.dart',
      );

      expect(
        source,
        contains(
          'Business users can download Transaction and Commission Reports as PDF, Excel, or CSV.',
        ),
      );

      expect(
        source,
        contains(
          'Personal users can download Transaction Reports as PDF or CSV.',
        ),
      );
    });
  });
}
