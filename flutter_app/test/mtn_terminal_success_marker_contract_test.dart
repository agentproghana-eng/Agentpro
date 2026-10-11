import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final service = File(
    'android/app/src/main/kotlin/com/agentpro/ghana/UssdAccessibilityService.kt',
  ).readAsStringSync();

  test('MTN has a live-confirmed terminal success marker', () {
    final start = service.indexOf('PROVIDER_TERMINAL_SUCCESS_MARKERS = mapOf(');
    final end = service.indexOf('PROVIDER_TERMINAL_SUCCESS_PROMOTION_MARKERS');
    final block = service.substring(start, end);

    expect(block, contains('"mtn" to listOf('));
    expect(block, contains('"sent to"'));
    // The bank-transfer PIN screen shows the fee sentence, so it must not
    // be a success marker.
    expect(block, isNot(contains('"transaction fee amount is"')));
    expect(block, contains('"has been made successfully"'));
    // Telecel keeps its own marker.
    expect(block, contains('"confirmed. ghs"'));
  });

  test('terminal success is only trusted after the PIN prompt', () {
    final start = service.indexOf('if (reachedPinPrompt) {');
    final block = service.substring(start, start + 600);

    expect(block, contains('pendingTerminalSuccessMarkers'));
  });

  test('provider result dialog is closed after a result, never with Send', () {
    final start = service.indexOf('private fun dismissProviderResultDialog(');
    final end = service.indexOf('private fun findByText(');
    final helper = service.substring(start, end);

    expect(helper, contains('listOf("ok", "cancel")'));
    expect(helper, isNot(contains('"send"')));
    expect(helper, contains('if (isSessionActive) return'));
    expect(
      RegExp(r'endSession\(\)\s*dismissProviderResultDialog\(root\)')
          .allMatches(service)
          .length,
      3,
    );
  });
}
