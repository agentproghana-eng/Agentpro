import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('failed zero-input preparation restores the workspace loading guard', () {
    final source = File('lib/features/transactions/transaction_screen.dart')
        .readAsStringSync();
    final begin = source.indexOf('Future<void> _proceed() async {');
    final end = source.indexOf('Future<void> _proceedInternal(', begin);
    final block = source.substring(begin, end);
    expect(block, contains(
      'if (zeroInput && !_zeroInputBackendInitiationStarted && mounted)'));
    expect(block, contains('setState(() => _loading = false);'));
    expect(block, contains('abandonDurableBeforeBackendInitiation('));
  });

  test('MTN enquiries execute in workspace without a second transaction form', () {
    final source = File('lib/features/transactions/transaction_screen.dart')
        .readAsStringSync();
    final handler = source.split('Future<void> _openMtnAgentCashEnquiry(')[1]
        .split('void _showPendingBalanceConfiguration(')[0];
    expect(handler, isNot(contains("path: '/transactions'")));
    expect(handler, contains('await _verifyZeroInputAutoStart()'));
    expect(handler, contains('await _proceed()'));
    expect(handler, contains('_workspaceEnquiryBusy = true'));
    expect(handler, contains('_workspaceEnquiryBusy = false'));
    expect(source, contains('_activeMtnCashEnquiry ?? _mtnCashInOutOperation'));
    expect(source, contains('final zeroInput = _authorizedZeroInput'));
    expect(source, contains("'zero_input_quick_action': _authorizedZeroInput"));
    expect(source, contains("'zero_input_preflight_approved': _authorizedZeroInput"));
    expect(source, contains("_workspaceZeroInput ? ''"));
    expect(source, contains("'amount': _workspaceZeroInput ? 0"));
    expect(source, contains("'customer_phone':"));
    expect(source, contains("String? _workspaceEnquirySimKey;"));
    expect(source, contains("_workspaceEnquirySimStillSelected"));
    expect(source, contains("businessSimRole != 'agent'"));
    expect(source, contains("_workspaceEnquiryRetryRequested = true;"));
    expect(source, contains("} while (mounted && _workspaceEnquiryRetryRequested);"));
    expect(source, contains("_workspaceZeroInput ? ''"));
    expect(source, contains("if (_workspaceZeroInput) return '';"));
    expect(source, contains("if (_authorizedZeroInput && isOffline)"));
    expect(source, contains("if (_workspaceEnquiryBusy) return;"));
    expect(source, contains("if (action == 'success' && !_workspaceZeroInput)"));

    for (final type in [
      'balance_enquiry', 'cash_in_commission', 'commission_balance',
    ]) {
      expect(RegExp(r"_openMtnAgentCashEnquiry\(\s*'" + type + r"'")
          .hasMatch(source), isTrue);
    }
  });
}
