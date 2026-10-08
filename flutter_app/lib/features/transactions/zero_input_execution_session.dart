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

  static int _nextReservation = 0;
  static String? _reservationOwner;

  /// Reserve synchronously before initiating a backend transaction.
  /// A reservation does not grant permission to dial.
  static String? reserveForInitiation() {
    if (!_gate.tryAcquire()) return null;
    final token = 'zero_input_${++_nextReservation}';
    _reservationOwner = token;
    return token;
  }

  /// Release only a matching lease before backend initiation begins.
  /// Do not call for an attempted request or an uncertain provider result.
  static void abandonBeforeBackendInitiation(String? token) {
    if (!ownsReservation(token)) return;
    _reservationOwner = null;
    _gate.release();
  }

  static bool ownsReservation(String? token) =>
      token != null && _gate.isBusy && _reservationOwner == token;


  static bool tryBegin({
    required String transactionType,
    required bool quickActionRequested,
    required bool preflightApproved,
    required bool simIdentityVerified,
    required bool backendAuthorizationReady,
    String? reservationToken,
  }) {
    if (!ZeroInputDirectExecutionPolicy.supportedTypes
        .contains(transactionType)) return false;
    if (!quickActionRequested || !preflightApproved ||
        !simIdentityVerified || !backendAuthorizationReady) return false;
    if (reservationToken != null) {
      if (!ownsReservation(reservationToken)) return false;
    } else if (!_gate.tryAcquire()) {
      return false;
    }
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
    String? reservationToken,
  }) {
    if (!resultDefinitive || !reportPersisted) return;
    if (_reservationOwner != null && !ownsReservation(reservationToken)) return;
    _reservationOwner = null;
    _gate.release();
  }
}
