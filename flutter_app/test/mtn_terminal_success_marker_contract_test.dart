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
    // Start after the screen text is collected: an earlier, unrelated
    // `if (reachedPinPrompt) {` precedes the real terminal-success check.
    final from = service.indexOf('val screenText = collectText(root)');
    final start = service.indexOf('if (reachedPinPrompt) {', from);
    final block = service.substring(start, start + 600);

    expect(block, contains('pendingTerminalSuccessMarkers'));
  });

  test('provider final message stays on screen for the user to press OK', () {
    expect(service, isNot(contains('dismissProviderResultDialog')));
    expect(service, isNot(contains('ACTION_CLICK)) {\n                    Log.d(TAG, "Closed provider result dialog')));
  });

  test('provider final message is passed to the app for the result page', () {
    expect(service, contains('providerMessage = latestProviderMessage'));
    expect(service, contains('latestProviderMessage = null'));
  });
}
