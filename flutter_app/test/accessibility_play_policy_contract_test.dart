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
          'text and interactive controls in the active USSD dialog',
        ),
      );

      expect(
        disclosureSource,
        contains(
          'Raw USSD screen text is processed only in memory',
        ),
      );

      expect(
        disclosureSource,
        contains(
          'It is not uploaded to AgentPro servers',
        ),
      );

      expect(
        disclosureSource,
        contains(
          'never stores or auto-enters your Mobile Money PIN',
        ),
      );

      expect(
        disclosureSource,
        contains(
          'By tapping Continue to Settings, you consent',
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

      final settingsIndex = source.indexOf(
        'accessEngine.openAccessibilitySettings()',
        disclosureIndex,
      );

      expect(enabledIndex, greaterThanOrEqualTo(0));
      expect(disclosureIndex, greaterThan(enabledIndex));
      expect(settingsIndex, greaterThan(disclosureIndex));

      final declineIndex = source.indexOf(
        'if (!consented)',
        disclosureIndex,
      );

      expect(declineIndex, greaterThan(disclosureIndex));
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
