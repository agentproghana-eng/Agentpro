import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File('lib/features/transactions/transaction_screen.dart')
      .readAsStringSync();

  test('the workspace form stays visible while an enquiry starts', () {
    expect(source, contains('bool get _keepWorkspaceFormVisible =>'));
    expect(source, contains('_isMtnCashInOutWorkspace && _workspaceEnquiryBusy;'));
    expect(source, contains('_showsRecipientField) ...['));
    expect(source, contains('_keepWorkspaceFormVisible ||\n                  !_usesServerDrivenForm &&\n                  _needsAmount) ...['));
    expect(source, contains('if (_showsAgentServiceFee) ...['));
  });

  test('the five workspace buttons are not greyed out by an enquiry', () {
    expect(
      RegExp(r'onPressed: _loading && !_workspaceEnquiryBusy')
          .allMatches(source)
          .length,
      5,
    );
    expect(source, isNot(contains('onPressed: _loading || _workspaceEnquiryBusy')));
  });

  test('taps during an enquiry are still ignored by the handlers', () {
    final handler = source
        .split('Future<void> _openMtnAgentCashEnquiry(')[1]
        .split('void _showPendingBalanceConfiguration(')[0];
    expect(handler, contains('_workspaceEnquiryBusy ||'));
    expect(source, contains('_loading || _submissionGateHeld || _workspaceEnquiryBusy;'));
    expect(
      RegExp(r'if \(_submissionInFlight\) return;').allMatches(source).length,
      greaterThanOrEqualTo(4),
    );
  });
}
