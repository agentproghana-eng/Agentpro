import 'dart:async';

class ApiCache {
  ApiCache._();

  static final Map<String, _CacheEntry<dynamic>> _entries = {};
  static final Map<String, Future<dynamic>> _inFlight = {};

  static T? get<T>(String key) {
    final entry = _entries[key];

    if (entry == null || entry.isExpired) {
      return null;
    }

    return entry.value as T?;
  }

  static Future<T> getOrLoad<T>({
    required String key,
    required Future<T> Function() loader,
    Duration ttl = const Duration(minutes: 5),
    bool forceRefresh = false,
  }) async {
    if (!forceRefresh) {
      final cached = get<T>(key);

      if (cached != null) {
        return cached;
      }
    }

    final existing = _inFlight[key];

    if (existing != null) {
      return await existing as T;
    }

    final future = loader();
    _inFlight[key] = future;

    try {
      final value = await future;

      _entries[key] = _CacheEntry<T>(
        value: value,
        expiresAt: DateTime.now().add(ttl),
      );

      return value;
    } finally {
      _inFlight.remove(key);
    }
  }

  static Future<T> staleWhileRevalidate<T>({
    required String key,
    required Future<T> Function() loader,
    Duration ttl = const Duration(minutes: 5),
  }) async {
    final entry = _entries[key];

    if (entry != null) {
      if (entry.isExpired && !_inFlight.containsKey(key)) {
        unawaited(
          getOrLoad<T>(
            key: key,
            loader: loader,
            ttl: ttl,
            forceRefresh: true,
          ),
        );
      }

      return entry.value as T;
    }

    return getOrLoad<T>(
      key: key,
      loader: loader,
      ttl: ttl,
    );
  }

  static void put<T>(
    String key,
    T value, {
    Duration ttl = const Duration(minutes: 5),
  }) {
    _entries[key] = _CacheEntry<T>(
      value: value,
      expiresAt: DateTime.now().add(ttl),
    );
  }

  static void invalidate(String key) {
    _entries.remove(key);
  }

  static void invalidateWhere(
    bool Function(String key) predicate,
  ) {
    _entries.removeWhere((key, _) => predicate(key));
  }

  static void clear() {
    _entries.clear();
    _inFlight.clear();
  }
}

class _CacheEntry<T> {
  final T value;
  final DateTime expiresAt;

  const _CacheEntry({
    required this.value,
    required this.expiresAt,
  });

  bool get isExpired => DateTime.now().isAfter(expiresAt);
}
