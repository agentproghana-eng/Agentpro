bool shouldFallbackToCachedUssdFlow({
  required bool hasHttpResponse,
  int? statusCode,
}) {
  // No HTTP response means the server could not be reached.
  // A previously verified scoped cache may be used for resilience.
  if (!hasHttpResponse) {
    return true;
  }

  // Only transient failures may use stale cached automation.
  //
  // Authoritative 4xx responses such as 403, 404 or 422 must never
  // be bypassed by executing an older local flow.
  return statusCode == 408 ||
      statusCode == 429 ||
      (statusCode != null && statusCode >= 500);
}
