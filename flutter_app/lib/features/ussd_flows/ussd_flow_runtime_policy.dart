bool shouldFallbackToCachedUssdFlow({
  required bool hasHttpResponse,
  int? statusCode,
}) {
  // Cached Flow Builder configuration is authoritative only for a genuine
  // offline transaction that was explicitly prepared by TransactionScreen.
  //
  // An online-started financial transaction must never execute an older
  // cached provider menu merely because the current resolver timed out,
  // returned 429, or encountered a server error. Provider menus can change
  // without an app release; stale automation is therefore more dangerous
  // than asking the user to retry.
  //
  // Keep the parameters in this policy boundary so callers/tests explicitly
  // document whether an HTTP response existed and what happened.
  return false;
}
