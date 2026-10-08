/// In-memory single-flight gate for a zero-input Quick Action.
///
/// This gate does not authorize or execute USSD. Callers must separately
/// verify the active flow, SIM identity, account and backend authorization.
/// The lease stays held until the complete provider session is settled,
/// not merely until the Android dial intent has been launched.
class ZeroInputExecutionGate {
  bool _busy = false;

  bool get isBusy => _busy;

  /// Returns false for a duplicate tap while an attempt is active.
  bool tryAcquire() {
    if (_busy) return false;
    _busy = true;
    return true;
  }

  /// Release only after the attempt has definitely ended.
  void release() {
    _busy = false;
  }
}
