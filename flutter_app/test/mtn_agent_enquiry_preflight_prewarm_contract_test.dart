import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File('lib/features/transactions/transaction_screen.dart')
      .readAsStringSync();

  test('enquiry preflight is prewarmed and cached for a short time', () {
    expect(source, contains('static const Duration _enquiryPreflightTtl'));
    expect(source, contains('Future<void> _prewarmEnquiryPreflight() async'));
    expect(source, contains('unawaited(_prewarmEnquiryPreflight());'));
  });

  test('prewarm only caches an approved agent-role verification', () {
    final prewarm = source
        .split('Future<void> _prewarmEnquiryPreflight() async')[1]
        .split('bool get _workspaceEnquirySimStillSelected')[0];
    expect(prewarm, contains("role != 'agent'"));
    expect(prewarm, contains('await ZeroInputFlowPreflight.verify('));
    expect(prewarm, contains('if (mounted &&'));
    expect(prewarm, contains('approved &&'));
    expect(prewarm, contains('} catch (_) {'));
  });

  test('cache hit is only trusted after the input and SIM guards', () {
    final verify = source
        .split('Future<bool> _verifyZeroInputAutoStart() async')[1]
        .split('void initState()')[0];
    final guards = verify.indexOf('final selectedSim = _selectedSim;');
    final cacheHit =
        verify.indexOf('_hasFreshEnquiryPreflight(_transactionType)');
    final live = verify.indexOf('await ZeroInputFlowPreflight.verify(');
    expect(guards, greaterThan(0));
    expect(cacheHit, greaterThan(guards));
    expect(live, greaterThan(cacheHit));
    expect(verify, contains('_recordEnquiryPreflight(_transactionType)'));
    expect(verify, contains('return _workspaceEnquirySimStillSelected;'));
  });
}
