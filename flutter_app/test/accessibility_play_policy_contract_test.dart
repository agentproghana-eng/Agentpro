import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'prominent disclosure describes Accessibility data and consent',
    () {
      final source = File(
        'lib/shared/widgets/'
        'ussd_accessibility_disclosure.dart',
      ).readAsStringSync();

      // Dart format can split long displayed strings across adjacent
      // literals. Join those boundaries for rendered-text assertions.
      final disclosureSource = source.replaceAll(
        RegExp(r"'\s*'"),
        '',
      );

      expect(
        disclosureSource,
        contains('USSD Automation Access'),
      );

      expect(
        disclosureSource,
        contains(
          'AgentPro uses Android Accessibility only for USSD '
          'transactions you start.',
        ),
      );

      expect(
        disclosureSource,
        contains(
          'It reads the active USSD menu and enters the non-PIN '
          'transaction details you already provided.',
        ),
      );

      expect(
        disclosureSource,
        contains(
          'Your Mobile Money PIN is never read, stored, or entered by '
          'AgentPro.',
        ),
      );

      expect(
        disclosureSource,
        contains(
          'USSD screen content is processed only on this device during '
          'the active session and is cleared when the session ends.',
        ),
      );

      expect(
        disclosureSource,
        contains(
          'Only the transaction outcome is returned to AgentPro.',
        ),
      );

      expect(
        disclosureSource,
        contains(
          'You can turn this access off anytime in Android Settings.',
        ),
      );

      expect(
        disclosureSource,
        contains(
          'Tap Continue to Settings to enable USSD Automation, or '
          'Not Now to leave it off.',
        ),
      );

      expect(
        source,
        contains("Text('Not Now')"),
      );

      expect(
        source,
        contains("Text('Continue to Settings')"),
      );

      expect(
        source,
        contains('return consented == true;'),
      );
    },
  );

  test(
    'disclosure immediately precedes Accessibility Settings request',
    () {
      final source = File(
        'lib/features/transactions/'
        'transaction_progress_screen.dart',
      ).readAsStringSync();

      final enabledIndex = source.indexOf(
        'accessEngine.isServiceEnabled()',
      );

      final disclosureIndex = source.indexOf(
        'showUssdAccessibilityDisclosure',
        enabledIndex,
      );

      final declineIndex = source.indexOf(
        'if (!consented)',
        disclosureIndex,
      );

      final guideCallIndex = source.indexOf(
        'enabled = await _guideAccessibilitySetup(',
        declineIndex,
      );

      final guideDefinitionIndex = source.indexOf(
        'Future<bool> _guideAccessibilitySetup(',
      );

      final settingsRoundTripIndex = source.indexOf(
        'accessEngine.openAccessibilitySettings,',
        guideDefinitionIndex,
      );

      expect(enabledIndex, greaterThanOrEqualTo(0));
      expect(disclosureIndex, greaterThan(enabledIndex));
      expect(declineIndex, greaterThan(disclosureIndex));
      expect(guideCallIndex, greaterThan(declineIndex));
      expect(guideDefinitionIndex, greaterThanOrEqualTo(0));
      expect(
        settingsRoundTripIndex,
        greaterThan(guideDefinitionIndex),
      );
      expect(
        source,
        contains(
          'USSD automation was not enabled. '
          'No USSD request was sent.',
        ),
      );
    },
  );

  test(
    'Accessibility is optional and does not gate cold launch',
    () {
      final mainSource = File(
        'lib/main.dart',
      ).readAsStringSync();

      expect(
        mainSource,
        isNot(contains('_AccessibilityGate')),
      );

      expect(
        mainSource,
        isNot(contains('isServiceEnabled()')),
      );

      expect(
        mainSource,
        isNot(contains('openAccessibilitySettings()')),
      );
    },
  );

  test(
    'Accessibility service is classified correctly',
    () {
      final config = File(
        'android/app/src/main/res/xml/'
        'ussd_accessibility_service_config.xml',
      ).readAsStringSync();

      expect(
        config,
        contains('android:isAccessibilityTool="false"'),
      );

      expect(
        config,
        contains('android:canRetrieveWindowContent="true"'),
      );

      expect(
        config,
        contains(
          'android:summary="@string/'
          'ussd_accessibility_service_summary"',
        ),
      );

      expect(
        config,
        contains(
          'android:intro="@string/'
          'ussd_accessibility_service_intro"',
        ),
      );
    },
  );

  test(
    'password nodes are excluded from Accessibility text collection',
    () {
      final source = File(
        'android/app/src/main/kotlin/com/agentpro/ghana/'
        'UssdAccessibilityService.kt',
      ).readAsStringSync();

      expect(
        source,
        contains('if (node.isPassword)'),
      );

      expect(
        source,
        contains('return ""'),
      );

      expect(
        source,
        contains('if (!isSessionActive) return'),
      );

      expect(
        source,
        contains('reachedPinPrompt = true'),
      );
    },
  );
}
