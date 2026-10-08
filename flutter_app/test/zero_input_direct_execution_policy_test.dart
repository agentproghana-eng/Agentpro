import 'package:flutter_test/flutter_test.dart';
import 'package:agent_pro_ghana/features/transactions/zero_input_direct_execution_policy.dart';

void main() {
  bool allowed(String type, {
    bool quick = true,
    bool preflight = true,
    bool sim = true,
    bool backend = true,
    bool lease = true,
  }) => ZeroInputDirectExecutionPolicy.mayUseDirectRoute(
    transactionType: type,
    quickActionRequested: quick,
    zeroInputPreflightApproved: preflight,
    simIdentityVerified: sim,
    backendAuthorizationReady: backend,
    executionLeaseAcquired: lease,
  );

  test('allows only eligible zero-input balance quick actions', () {
    for (final type in ['balance_enquiry', 'check_momo_balance', 'check_airtime_balance']) {
      expect(allowed(type), isTrue);
    }
    for (final type in ['send_money', 'cash_out', 'airtime', 'data_bundle', 'withdrawal']) {
      expect(allowed(type), isFalse);
    }
  });

  test('fails closed when any mandatory condition is absent', () {
    expect(allowed('balance_enquiry', quick: false), isFalse);
    expect(allowed('balance_enquiry', preflight: false), isFalse);
    expect(allowed('balance_enquiry', sim: false), isFalse);
    expect(allowed('balance_enquiry', backend: false), isFalse);
    expect(allowed('balance_enquiry', lease: false), isFalse);
  });
}
