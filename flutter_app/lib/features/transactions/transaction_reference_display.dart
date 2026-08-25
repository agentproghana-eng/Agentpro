String compactTransactionReference(Object? value) {
  final raw = value?.toString().trim() ?? '';

  if (raw.isEmpty) {
    return raw;
  }

  final agentProMatch = RegExp(
    r'^APG-\d{10,}-([A-Za-z0-9]{4,})$',
  ).firstMatch(raw);

  if (agentProMatch != null) {
    return 'APG-${agentProMatch.group(1)!.toUpperCase()}';
  }

  if (raw.length <= 16) {
    return raw;
  }

  return '${raw.substring(0, 6)}…${raw.substring(raw.length - 8)}';
}
