import 'package:flutter_test/flutter_test.dart';
import 'package:agent_pro_ghana/features/transactions/zero_input_execution_session.dart';

void main() {
  test('requires every authorization signal', () {
    expect(ZeroInputExecutionSession.tryBegin(
      transactionType: 'balance_enquiry',
      quickActionRequested: true,
      preflightApproved: true,
      simIdentityVerified: true,
      backendAuthorizationReady: false,
    ), isFalse);
    expect(ZeroInputExecutionSession.isActive, isFalse);
  });

  test('blocks overlap and uncertain settlement', () {
    bool begin() => ZeroInputExecutionSession.tryBegin(
      transactionType: 'balance_enquiry',
      quickActionRequested: true,
      preflightApproved: true,
      simIdentityVerified: true,
      backendAuthorizationReady: true,
    );
    expect(begin(), isTrue);
    expect(begin(), isFalse);
    ZeroInputExecutionSession.settleDefinitiveResult(
      resultDefinitive: false, reportPersisted: true);
    expect(begin(), isFalse);
    ZeroInputExecutionSession.settleDefinitiveResult(
      resultDefinitive: true, reportPersisted: false);
    expect(begin(), isFalse);
    ZeroInputExecutionSession.settleDefinitiveResult(
      resultDefinitive: true, reportPersisted: true);
    expect(begin(), isTrue);
    ZeroInputExecutionSession.settleDefinitiveResult(
      resultDefinitive: true, reportPersisted: true);
  });

  test('rejects money movement even with all signals', () {
    expect(ZeroInputExecutionSession.tryBegin(
      transactionType: 'send_money',
      quickActionRequested: true,
      preflightApproved: true,
      simIdentityVerified: true,
      backendAuthorizationReady: true,
    ), isFalse);
  });
}
