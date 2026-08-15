List<String> normalizedMarketplaceImageUrls(dynamic value) {
  if (value is! List) {
    return const <String>[];
  }

  return value
      .whereType<String>()
      .map((image) => image.trim())
      .where((image) => image.isNotEmpty)
      .toList(growable: false);
}

DateTime? parseMarketplaceDateTime(dynamic value) {
  final text = value?.toString().trim() ?? '';

  if (text.isEmpty) {
    return null;
  }

  return DateTime.tryParse(text);
}
