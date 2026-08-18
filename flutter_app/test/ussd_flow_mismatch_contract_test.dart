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

  String sourceSlice(
    String source,
    String startMarker,
    String endMarker,
  ) {
    final start = source.indexOf(startMarker);
    final end = source.indexOf(endMarker, start + 1);

    expect(start, greaterThanOrEqualTo(0));
    expect(end, greaterThan(start));

    return source.substring(start, end);
  }

  test('generic pre-PIN mismatch handling is bounded', () {
    final generic = sourceSlice(
      nativeSource,
      'private fun handleGenericStep',
      '// Finds the single EditText',
    );

    expect(
      nativeSource,
      contains(
        'private const val MAX_GENERIC_FLOW_MISMATCHES = 3',
      ),
    );

    expect(
      generic,
      contains('resetGenericFlowMismatchState()'),
    );

    expect(
      generic,
      contains('recordGenericFlowMismatch(root, screenText)'),
    );
  });

  test('repeated mismatch evidence safely terminates native automation', () {
    final mismatch = sourceSlice(
      nativeSource,
      'private fun recordGenericFlowMismatch',
      'private fun handleGenericStep',
    );

    expect(
      mismatch,
      contains('genericFlowMismatchCount += 1'),
    );

    expect(
      mismatch,
      contains('MAX_GENERIC_FLOW_MISMATCHES'),
    );

    expect(
      mismatch,
      contains('"flow_mismatch"'),
    );

    expect(mismatch, contains('endSession()'));

    expect(
      mismatch,
      contains('UssdForegroundService.stop(this)'),
    );
  });

  test('duplicate provider events cannot instantly exhaust the budget', () {
    final mismatch = sourceSlice(
      nativeSource,
      'private fun recordGenericFlowMismatch',
      'private fun handleGenericStep',
    );

    expect(
      mismatch,
      contains('screenHash == lastMatchedScreenHash'),
    );

    expect(
      mismatch,
      contains('RECENT_MATCH_SCREEN_GRACE_MS'),
    );

    expect(
      mismatch,
      contains('screenHash == lastMismatchScreenHash'),
    );

    expect(
      mismatch,
      contains('REPEATED_MISMATCH_MIN_INTERVAL_MS'),
    );
  });

  test('mismatch evidence requires an interactive USSD provider root', () {
    final mismatch = sourceSlice(
      nativeSource,
      'private fun recordGenericFlowMismatch',
      'private fun handleGenericStep',
    );

    expect(
      mismatch,
      contains(
        'findByClassName(',
      ),
    );

    expect(
      mismatch,
      contains(
        '"android.widget.EditText"',
      ),
    );

    expect(
      mismatch,
      contains(
        'findByText(root, "send")',
      ),
    );
  });

  test('mismatch telemetry hashes the screen and excludes raw text', () {
    final mismatch = sourceSlice(
      nativeSource,
      'private fun recordGenericFlowMismatch',
      'private fun handleGenericStep',
    );

    expect(
      nativeSource,
      contains('MessageDigest.getInstance("SHA-256")'),
    );

    expect(
      mismatch,
      contains('screen_hash=\$screenHash'),
    );

    expect(
      mismatch,
      contains('provider=\$provider'),
    );

    expect(
      mismatch,
      contains('transaction_type=\$transactionType'),
    );

    expect(
      mismatch,
      contains('step_index=\$currentStepIndex'),
    );

    expect(
      mismatch,
      isNot(contains('screen_text=\$screenText')),
    );

    expect(
      mismatch,
      isNot(contains('screen=\$screenText')),
    );
  });

  test('FLOW_MISMATCH remains impossible after the PIN boundary', () {
    final mismatch = sourceSlice(
      nativeSource,
      'private fun recordGenericFlowMismatch',
      'private fun handleGenericStep',
    );

    final postPin = sourceSlice(
      nativeSource,
      'private fun handleAfterPinPrompt',
      '// Data-driven step matching',
    );

    expect(
      mismatch,
      contains('reachedPinPrompt'),
    );

    expect(
      postPin,
      isNot(contains('recordGenericFlowMismatch')),
    );

    expect(
      postPin,
      isNot(contains('respond(')),
    );

    expect(
      postPin,
      isNot(contains('ACTION_SET_TEXT')),
    );

    expect(
      postPin,
      isNot(contains('ACTION_CLICK')),
    );
  });

  test('Flutter maps FLOW_MISMATCH to pending confirmation', () {
    final handler = sourceSlice(
      dartSource,
      'Future<dynamic> _handleNativeCall',
      'Future<bool> isServiceEnabled',
    );

    expect(
      handler,
      contains(
        "'flow_mismatch' => "
        'USSDStatus.pendingConfirmation',
      ),
    );

    expect(
      handler,
      contains(
        'AgentPro stopped automation and did not retry.',
      ),
    );

    expect(
      handler,
      isNot(
        contains(
          "'flow_mismatch' => USSDStatus.failed",
        ),
      ),
    );
  });

  test('mismatch state is wiped between transaction sessions', () {
    expect(
      RegExp(
        r'genericFlowMismatchCount = 0',
      ).allMatches(nativeSource).length,
      greaterThanOrEqualTo(3),
    );

    expect(
      RegExp(
        r'lastMismatchScreenHash = null',
      ).allMatches(nativeSource).length,
      greaterThanOrEqualTo(3),
    );

    expect(
      RegExp(
        r'lastMatchedScreenHash = null',
      ).allMatches(nativeSource).length,
      greaterThanOrEqualTo(2),
    );
  });
}
