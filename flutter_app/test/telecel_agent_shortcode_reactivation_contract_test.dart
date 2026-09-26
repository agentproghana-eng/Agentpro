import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final settings = File(
    'lib/features/ussd_settings/ussd_settings_screen.dart',
  ).readAsStringSync();

  final progress = File(
    'lib/features/transactions/transaction_progress_screen.dart',
  ).readAsStringSync();

  final androidChannel = File(
    'android/app/src/main/kotlin/com/agentpro/ghana/'
    'UssdAccessibilityChannel.kt',
  ).readAsStringSync();

  test('Agent and Merchant shortcode labels are role-specific', () {
    expect(settings, contains("label: 'Agent Shortcode'"));
    expect(
      settings,
      contains("label: 'Organisation Shortcode'"),
    );

    expect(
      settings,
      contains("simRole: 'agent'"),
    );
    expect(
      settings,
      contains("simRole: 'merchant'"),
    );
  });

  test('existing protected Agent storage contract is preserved', () {
    expect(
      settings,
      contains(
        "data['telecel_agent_organisation_shortcode_configured']",
      ),
    );

    expect(
      settings,
      contains(
        "data['telecel_merchant_organisation_shortcode_configured']",
      ),
    );
  });

  test('transaction errors distinguish the two shortcode roles', () {
    expect(
      progress,
      contains(
        "'Required Telecel Agent Shortcode unavailable'",
      ),
    );

    expect(
      progress,
      contains(
        "'Required Telecel Organisation Shortcode unavailable'",
      ),
    );

    expect(
      progress,
      contains("role == 'agent'"),
    );

    expect(
      progress,
      isNot(contains("widget.businessSimRole == 'agent'")),
    );
  });

  test('Android validation distinguishes Agent shortcode', () {
    expect(
      androidChannel,
      contains('"MISSING_AGENT_SHORTCODE"'),
    );

    expect(
      androidChannel,
      contains('"MISSING_ORGANISATION_SHORTCODE"'),
    );

    expect(
      androidChannel,
      contains('"Agent Shortcode"'),
    );

    expect(
      androidChannel,
      contains('"Organisation Shortcode"'),
    );
  });

  test('shortcode routing remains tied to the selected SIM role', () {
    expect(
      androidChannel,
      contains('normalizedBusinessSimRole == "agent"'),
    );

    expect(
      androidChannel,
      contains('it.action == "send_organisation_shortcode"'),
    );
  });
}
