import '../constants/app_constants.dart';

class AppCacheService {
  AppCacheService._();

  static final Map<String, _CacheEntry> _cache = {};

  static void set(
    String key,
    dynamic value, {
    Duration? duration,
  }) {
    _cache[key] = _CacheEntry(
      value,
      DateTime.now().add(
        duration ?? AppConstants.dashboardCacheDuration,
      ),
    );
  }

  static dynamic get(String key) {
    final entry = _cache[key];

    if (entry == null) return null;

    if (DateTime.now().isAfter(entry.expiry)) {
      _cache.remove(key);
      return null;
    }

    return entry.value;
  }

  static void remove(String key) {
    _cache.remove(key);
  }

  static void clear() {
    _cache.clear();
  }
}

class _CacheEntry {
  final dynamic value;
  final DateTime expiry;

  const _CacheEntry(this.value, this.expiry);
}
