import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final screen = File('lib/features/transactions/transaction_screen.dart')
      .readAsStringSync();
  final home =
      File('lib/features/dashboard/home_tab.dart').readAsStringSync();
  final preflight =
      File('lib/features/transactions/zero_input_flow_preflight.dart')
          .readAsStringSync();

  test('enquiries go offline only from a flow saved on this device', () {
    final block = screen
        .split('if (_authorizedZeroInput && isOffline) {')[1]
        .split('final transactionDisabled =')[0];
    expect(block, contains('OfflineQueueService.getCachedFlow('));
    expect(block, contains('if (!hasSavedFlow) {'));
    expect(block, contains('A verified internet connection is required'));
    expect(block, contains('return;'));
  });

  test('the offline trust window still guards the offline route', () {
    expect(screen, contains('evaluateOfflineTransactionTrust('));
    expect(screen, contains('FeatureFlagService.isTransactionDisabled('));
  });

  test('approved flows are saved for offline use', () {
    expect(preflight, contains('onApprovedFlow'));
    expect(preflight, contains('if (eligible) onApprovedFlow?.call(flow);'));
    expect(screen, contains('onApprovedFlow: (flow) {'));
    expect(home, contains('onApprovedFlow: (flow) {'));
    expect(home, contains('OfflineQueueService.cacheFlow('));
  });
}
