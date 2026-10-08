import 'zero_input_execution_gate.dart';
import 'zero_input_direct_execution_policy.dart';

/// One process-wide lease for a provider-owned zero-input USSD session.
///
/// Acquiring the lease is NOT authorization to dial. The caller must still
/// perform backend initiation and device/SIM checks before execution.
/// A pending or unreported outcome intentionally keeps the lease held.
class ZeroInputExecutionSession {
  ZeroInputExecutionSession._();

  static final ZeroInputExecutionGate _gate = ZeroInputExecutionGate();

  static bool get isActive => _gate.isBusy;

  static bool tryBegin({
    required String transactionType,
    required bool quickActionRequested,
    required bool preflightApproved,
    required bool simIdentityVerified,
    required bool backendAuthorizationReady,
  }) {
    if (!ZeroInputDirectExecutionPolicy.supportedTypes
        .contains(transactionType)) return false;
    if (!quickActionRequested || !preflightApproved ||
        !simIdentityVerified || !backendAuthorizationReady) return false;
    if (!_gate.tryAcquire()) return false;
    return ZeroInputDirectExecutionPolicy.mayUseDirectRoute(
      transactionType: transactionType,
      quickActionRequested: quickActionRequested,
      zeroInputPreflightApproved: preflightApproved,
      simIdentityVerified: simIdentityVerified,
      backendAuthorizationReady: backendAuthorizationReady,
      executionLeaseAcquired: true,
    );
  }

  /// Call only after a definitive provider result is durably recorded.
  static void settleDefinitiveResult({
    required bool resultDefinitive,
    required bool reportPersisted,
  }) {
    if (resultDefinitive && reportPersisted) _gate.release();
  }
}
