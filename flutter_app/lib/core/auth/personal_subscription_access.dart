bool hasActivePaidPersonalPlan(
  Map<String, dynamic> user, {
  DateTime? now,
}) {
  if (user['personal_subscription_plan'] != 'paid') {
    return false;
  }

  final rawExpiry = user['personal_subscription_expires_at'];

  if (rawExpiry == null) {
    return true;
  }

  final expiryText = rawExpiry.toString().trim();

  if (expiryText.isEmpty) {
    return false;
  }

  final expiresAt = DateTime.tryParse(expiryText);

  if (expiresAt == null) {
    return false;
  }

  return !expiresAt.isBefore(now ?? DateTime.now());
}
