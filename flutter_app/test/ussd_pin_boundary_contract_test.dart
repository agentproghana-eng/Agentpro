import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final nativeSource = File(
    'android/app/src/main/kotlin/com/agentpro/ghana/'
    'UssdAccessibilityService.kt',
  ).readAsStringSync();

  final dartSource = File(
    'lib/core/services/ussd_service.dart',
  ).readAsStringSync();

  test(
    'Accessibility interruption becomes pending confirmation',
    () {
      final start = nativeSource.indexOf(
        'override fun onInterrupt()',
      );

      final end = nativeSource.indexOf(
        'override fun onAccessibilityEvent',
        start,
      );

      expect(start, greaterThanOrEqualTo(0));
      expect(end, greaterThan(start));

      final interrupt = nativeSource.substring(start, end);

      expect(
        interrupt,
        contains('"pending_confirmation"'),
      );

      expect(
        interrupt,
        contains('endSession()'),
      );

      expect(
        interrupt,
        contains('UssdForegroundService.stop(this)'),
      );
    },
  );

  test(
    'native service performs no write or click after PIN boundary',
    () {
      final start = nativeSource.indexOf(
        'private fun handleAfterPinPrompt',
      );

      final end = nativeSource.indexOf(
        '// Data-driven step matching',
        start,
      );

      expect(start, greaterThanOrEqualTo(0));
      expect(end, greaterThan(start));

      final postPin = nativeSource.substring(start, end);

      expect(
        postPin,
        isNot(contains('respond(')),
      );

      expect(
        postPin,
        isNot(contains('auto_confirm_once')),
      );

      expect(
        postPin,
        isNot(contains('ACTION_SET_TEXT')),
      );

      expect(
        postPin,
        isNot(contains('ACTION_CLICK')),
      );

      expect(
        nativeSource,
        contains(
          'reachedPinPrompt -> '
          'handleAfterPinPrompt(screenText)',
        ),
      );

      expect(
        nativeSource,
        isNot(contains('confirmSent')),
      );
    },
  );

  test(
    'Flutter preserves native pending confirmation outcome',
    () {
      final handlerStart = dartSource.indexOf(
        'Future<dynamic> _handleNativeCall',
      );

      final handlerEnd = dartSource.indexOf(
        'Future<bool> isServiceEnabled',
        handlerStart,
      );

      expect(
        handlerStart,
        greaterThanOrEqualTo(0),
      );

      expect(
        handlerEnd,
        greaterThan(handlerStart),
      );

      final handler = dartSource.substring(
        handlerStart,
        handlerEnd,
      );

      expect(
        handler,
        contains(
          "'pending_confirmation' => "
          'USSDStatus.pendingConfirmation',
        ),
      );

      expect(
        handler,
        contains(
          'outcome: mappedOutcome',
        ),
      );
    },
  );

  test(
    'legacy auto-confirm action cannot execute after pin_prompt',
    () {
      final genericStart = nativeSource.indexOf(
        'private fun handleGenericStep',
      );

      final genericEnd = nativeSource.indexOf(
        'private fun respond',
        genericStart,
      );

      expect(genericStart, greaterThanOrEqualTo(0));
      expect(genericEnd, greaterThan(genericStart));

      final generic = nativeSource.substring(
        genericStart,
        genericEnd,
      );

      expect(
        generic,
        contains(
          '"auto_confirm_once" -> false',
        ),
      );

      expect(
        nativeSource,
        contains(
          'reachedPinPrompt -> '
          'handleAfterPinPrompt(screenText)',
        ),
      );
    },
  );
}
