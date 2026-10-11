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

  test('screen shows the trusted local role before the server answers', () {
    final preload = screen
        .split('Future<void> _preloadSelectedFlow() async {')[1]
        .split('void _selectProvider(')[0];
    final local = preload.indexOf('SimRoleAssignmentService.cachedRoleForSlot(');
    final server =
        preload.indexOf('SimRoleAssignmentService.businessRoleForSlot(');
    expect(local, greaterThan(0));
    expect(server, greaterThan(local));
    expect(preload, contains('refreshFromServer: true'));
    expect(preload, contains('allowLegacyAgentFallback: false'));
    // Only business roles are accepted from the local copy.
    expect(preload, contains("localRole == 'agent'"));
    // The server answer still replaces or withdraws the local role.
    expect(preload, contains('_selectedBusinessSimRole = null;'));
  });

  test('auto-start reuses the resolved role instead of asking again', () {
    final verify = screen
        .split('Future<bool> _verifyZeroInputAutoStart() async')[1]
        .split('void initState()')[0];
    expect(verify, contains('final knownRole ='));
    expect(verify, contains('knownRole ??'));
  });

  test('home verifies agent enquiry flows ahead of the tap', () {
    expect(home, contains('Future<void> _prewarmAgentEnquiryApprovals('));
    expect(home, contains("roles[sim.slot] != 'agent'"));
    expect(home, contains('unawaited(_prewarmAgentEnquiryApprovals('));
    expect(home, contains('ZeroInputFlowPreflight.verify('));
    expect(home, contains('if (approved)'));
  });

  test('home and the screen share one approvals store', () {
    expect(preflight, contains('class ZeroInputPreflightApprovals'));
    expect(screen, contains('ZeroInputPreflightApprovals.verifiedAt;'));
    expect(home, contains('ZeroInputPreflightApprovals.verifiedAt['));
  });
}
