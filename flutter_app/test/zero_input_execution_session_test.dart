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
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);

    bool begin() => ZeroInputExecutionSession.tryBegin(
      transactionType: 'balance_enquiry',
      quickActionRequested: true,
      preflightApproved: true,
      simIdentityVerified: true,
      backendAuthorizationReady: true,
      reservationToken: token,
    );

    expect(begin(), isTrue);
    expect(ZeroInputExecutionSession.reserveForInitiation(), isNull);

    ZeroInputExecutionSession.settleDefinitiveResult(
      resultDefinitive: false,
      reportPersisted: true,
      reservationToken: token,
    );
    expect(ZeroInputExecutionSession.isActive, isTrue);

    ZeroInputExecutionSession.settleDefinitiveResult(
      resultDefinitive: true,
      reportPersisted: false,
      reservationToken: token,
    );
    expect(ZeroInputExecutionSession.isActive, isTrue);

    ZeroInputExecutionSession.settleDefinitiveResult(
      resultDefinitive: true,
      reportPersisted: true,
      reservationToken: token,
    );
    expect(ZeroInputExecutionSession.isActive, isFalse);
  });

  test('unreported definitive outcome keeps the lease held', () {
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);

    expect(ZeroInputExecutionSession.tryBegin(
      transactionType: 'check_momo_balance',
      quickActionRequested: true,
      preflightApproved: true,
      simIdentityVerified: true,
      backendAuthorizationReady: true,
      reservationToken: token,
    ), isTrue);

    ZeroInputExecutionSession.settleDefinitiveResult(
      resultDefinitive: true,
      reportPersisted: false,
      reservationToken: token,
    );
    expect(ZeroInputExecutionSession.isActive, isTrue);
    expect(ZeroInputExecutionSession.reserveForInitiation(), isNull);

    ZeroInputExecutionSession.settleDefinitiveResult(
      resultDefinitive: true,
      reportPersisted: true,
      reservationToken: token,
    );
    expect(ZeroInputExecutionSession.isActive, isFalse);
  });

  test('reported pending confirmation cannot release the lease', () {
    final token = ZeroInputExecutionSession.reserveForInitiation();
    expect(token, isNotNull);

    expect(ZeroInputExecutionSession.tryBegin(
      transactionType: 'check_airtime_balance',
      quickActionRequested: true,
      preflightApproved: true,
      simIdentityVerified: true,
      backendAuthorizationReady: true,
      reservationToken: token,
    ), isTrue);

    ZeroInputExecutionSession.settleDefinitiveResult(
      resultDefinitive: false,
      reportPersisted: true,
      reservationToken: token,
    );
    expect(ZeroInputExecutionSession.isActive, isTrue);

    ZeroInputExecutionSession.settleDefinitiveResult(
      resultDefinitive: true,
      reportPersisted: true,
      reservationToken: token,
    );
    expect(ZeroInputExecutionSession.isActive, isFalse);
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
