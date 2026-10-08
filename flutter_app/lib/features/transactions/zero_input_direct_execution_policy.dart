/// Fail-closed routing policy for a future screenless zero-input execution.
///
/// A UI route decision is never authorization. Backend initiation, physical
/// SIM revalidation, provider session settlement and reporting must still run.
class ZeroInputDirectExecutionPolicy {
  static const supportedTypes = <String>{
    'balance_enquiry',
    'check_momo_balance',
    'check_airtime_balance',
  };

  static bool mayUseDirectRoute({
    required String transactionType,
    required bool quickActionRequested,
    required bool zeroInputPreflightApproved,
    required bool simIdentityVerified,
    required bool backendAuthorizationReady,
    required bool executionLeaseAcquired,
  }) {
    return supportedTypes.contains(transactionType) &&
        quickActionRequested &&
        zeroInputPreflightApproved &&
        simIdentityVerified &&
        backendAuthorizationReady &&
        executionLeaseAcquired;
  }
}
