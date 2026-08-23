import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import 'storage_service.dart';

int notificationIdForDeliveryKey(String deliveryKey) {
  // Deterministic FNV-1a hash, restricted to a positive 31-bit Android
  // notification ID. Do not use String.hashCode because delivery identity
  // must remain stable across processes and app restarts.
  var hash = 0x811c9dc5;

  for (final codeUnit in deliveryKey.codeUnits) {
    hash ^= codeUnit;
    hash = (hash * 0x01000193) & 0xffffffff;
  }

  return hash & 0x7fffffff;
}

String notificationRouteForType(String? type) {
  switch (type) {
    case 'transaction_success':
    case 'transaction_failed':
    case 'transaction_pending_confirmation':
      return '/transactions';
    case 'low_float':
      return '/float';
    case 'subscription_reminder':
    case 'subscription_suspended':
    case 'renewal_approved':
      return '/subscription';
    case 'personal_subscription_approved':
    case 'personal_subscription_rejected':
      return '/personal-subscription';
    case 'ad_approved':
    case 'ad_rejected':
    case 'ad_expiring':
    case 'ad_expired':
      return '/marketplace';
    default:
      return '/notifications';
  }
}

/// Background message handler — must be top-level function
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Android/FCM already displays messages that contain a notification
  // payload while the app is backgrounded. Mirroring those messages with
  // flutter_local_notifications creates two tray entries with different
  // tap paths, so the user can tap the synthetic copy instead of Firebase's
  // canonical onMessageOpenedApp notification.
  //
  // Data-only messages intentionally remain silent here. AgentPro's current
  // production push contract includes a notification payload; inventing
  // user-visible content for an arbitrary data-only message would be unsafe.
  if (message.notification != null) {
    return;
  }
}

class NotificationService {
  static final _messaging = FirebaseMessaging.instance;
  static final _localNotifications = FlutterLocalNotificationsPlugin();
  static final StreamController<String> _navigationRequests =
      StreamController<String>.broadcast();

  static bool _initialized = false;
  static bool _firebaseReady = false;
  static bool _backendSyncPending = false;
  static bool _backendSyncRunning = false;
  static bool _backendSyncRequested = false;
  static StreamSubscription<RemoteMessage>? _foregroundSubscription;

  static const _backendSyncRetryDelays = <Duration>[
    Duration(seconds: 2),
    Duration(seconds: 5),
    Duration(seconds: 15),
    Duration(seconds: 30),
  ];
  static StreamSubscription<RemoteMessage>? _openedAppSubscription;
  static StreamSubscription<String>? _tokenRefreshSubscription;

  static const _channelId = 'agentpro_notifications';
  static const _channelName = 'Agent Pro Ghana';
  static const _channelDesc =
      'Transactions, float alerts, and subscription updates';

  static Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    try {
      await _initialize();
    } catch (_) {
      _initialized = false;
      rethrow;
    }
  }

  static Future<void> _initialize() async {
    // main.dart invokes NotificationService.init() only after
    // Firebase.initializeApp() completes. Backend token ownership therefore
    // depends on Firebase Core readiness, not on the slower optional local
    // notification permission/channel/tap initialization below.
    _firebaseReady = true;

    if (_backendSyncPending) {
      _backendSyncPending = false;
      unawaited(
        syncTokenWithBackend(),
      );
    }

    // Request permission via Firebase's cross-platform API.
    await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    // Set background handler
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    // Initialize local notifications
    const androidSettings =
        AndroidInitializationSettings('@drawable/ic_notification');
    const initSettings = InitializationSettings(android: androidSettings);
    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationTap,
    );

    // flutter_local_notifications uses a separate launch-details path when
    // one of our locally displayed notifications starts the app from a
    // fully terminated state. Preserve it until Firebase initial-message
    // resolution below so the same launch is not routed twice.
    final localLaunchDetails =
        await _localNotifications.getNotificationAppLaunchDetails();

    // ALSO explicitly request POST_NOTIFICATIONS (Android 13+) via
    // flutter_local_notifications' own Android-specific API. This is
    // deliberately in addition to _messaging.requestPermission() above,
    // not a replacement for it: FirebaseMessaging's wrapper has a
    // documented history of not reliably triggering the native Android
    // 13+ system dialog on its own, while this is the officially
    // supported, Android-specific path for that exact purpose.
    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();

    // Create notification channel (Android 8+)
    const channel = AndroidNotificationChannel(
      _channelId,
      _channelName,
      description: _channelDesc,
      importance: Importance.high,
      playSound: true,
      enableVibration: true,
    );
    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    // Handle foreground messages.
    await _foregroundSubscription?.cancel();
    _foregroundSubscription =
        FirebaseMessaging.onMessage.listen(_onForegroundMessage);

    // Handle notification taps when the app is in the background.
    await _openedAppSubscription?.cancel();
    _openedAppSubscription = FirebaseMessaging.onMessageOpenedApp.listen(
      _onMessageOpenedApp,
    );

    // Keep the backend bound to the current Firebase installation token.
    // Token rotation is normal and must not require another password login.
    await _tokenRefreshSubscription?.cancel();
    _tokenRefreshSubscription = _messaging.onTokenRefresh.listen((token) {
      unawaited(
        syncTokenWithBackend(),
      );
    });

    // Handle a notification that launched the app from a fully
    // terminated state.
    final initialMessage = await _messaging.getInitialMessage();

    if (initialMessage != null) {
      // Prefer Firebase's canonical launch message when both Firebase and
      // the local notification plugin can describe the same app launch.
      _onMessageOpenedApp(initialMessage);
    } else if (localLaunchDetails?.didNotificationLaunchApp ?? false) {
      final response = localLaunchDetails?.notificationResponse;

      if (response != null) {
        _onNotificationTap(response);
      }
    }
  }

  static Future<void> _onForegroundMessage(RemoteMessage message) async {
    await showLocalNotification(message);
  }

  static Future<void> showLocalNotification(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    final deliveryKey = message.data['delivery_key']?.toString().trim();

    final hasDeliveryKey = deliveryKey != null && deliveryKey.isNotEmpty;

    final androidDetails = AndroidNotificationDetails(
      _channelId,
      _channelName,
      channelDescription: _channelDesc,
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
      onlyAlertOnce: hasDeliveryKey,
      tag: hasDeliveryKey ? deliveryKey : null,
      icon: '@drawable/ic_notification',
      color: const Color(0xFF006B5E),
    );

    await _localNotifications.show(
      hasDeliveryKey
          ? notificationIdForDeliveryKey(deliveryKey)
          : notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(android: androidDetails),
      payload: message.data['type'],
    );
  }

  static void _onNotificationTap(NotificationResponse response) {
    // Navigate based on notification type
    final type = response.payload;
    // Navigation is handled by GoRouter — store pending navigation
    _queueNavigation(_routeForType(type));
  }

  static void _onMessageOpenedApp(RemoteMessage message) {
    final type = message.data['type'] as String?;
    _queueNavigation(_routeForType(type));
  }

  static String? _pendingNavigation;

  static Stream<String> get navigationRequests => _navigationRequests.stream;

  static void _queueNavigation(String route) {
    // Keep the route pending until the authenticated app router is ready.
    // The stream wakes a running app immediately; the pending value protects
    // cold-start and locally locked sessions where auth restoration happens
    // after the notification tap.
    _pendingNavigation = route;
    _navigationRequests.add(route);
  }

  static String? consumePendingNavigation() {
    final nav = _pendingNavigation;
    _pendingNavigation = null;
    return nav;
  }

  static String _routeForType(String? type) {
    return notificationRouteForType(type);
  }

  static Future<void> syncTokenWithBackend() async {
    _backendSyncRequested = true;

    if (_backendSyncRunning) {
      return;
    }

    _backendSyncRunning = true;

    try {
      while (_backendSyncRequested) {
        _backendSyncRequested = false;

        final completed = await _runBackendSyncWithRetry();

        if (!completed) {
          return;
        }
      }
    } finally {
      _backendSyncRunning = false;
    }
  }

  static Future<bool> _runBackendSyncWithRetry() async {
    for (var attempt = 0;
        attempt <= _backendSyncRetryDelays.length;
        attempt++) {
      final sessionLocked = await StorageService.isSessionLocked();

      if (sessionLocked) {
        return false;
      }

      if (!_firebaseReady) {
        _backendSyncPending = true;
        return false;
      }

      final accessToken = await StorageService.getAccessToken();

      if (accessToken == null || accessToken.isEmpty) {
        return false;
      }

      try {
        final token = await _messaging.getToken();

        if (token == null || token.trim().isEmpty) {
          return false;
        }

        final synced = await _syncTokenToBackend(token);

        if (synced) {
          return true;
        }
      } catch (_) {
        // Retry below. Push registration remains best effort.
      }

      if (attempt >= _backendSyncRetryDelays.length) {
        return false;
      }

      await Future<void>.delayed(
        _backendSyncRetryDelays[attempt],
      );
    }

    return false;
  }

  static Future<bool> _syncTokenToBackend(String token) async {
    try {
      final normalized = token.trim();

      if (normalized.isEmpty) {
        return false;
      }

      final sessionLocked = await StorageService.isSessionLocked();

      if (sessionLocked) {
        return false;
      }

      final accessToken = await StorageService.getAccessToken();

      if (accessToken == null || accessToken.isEmpty) {
        return false;
      }

      await ApiClient.instance.put(
        '/auth/fcm-token',
        data: {'fcm_token': normalized},
      );

      return true;
    } catch (_) {
      // The public synchronization path performs bounded retries.
      // Token refresh delivery remains best effort.
      return false;
    }
  }

  /// Get the FCM token for this device
  static Future<String?> getToken() async {
    return _messaging.getToken();
  }

  /// Listen for token refreshes
  static void onTokenRefresh(void Function(String) callback) {
    _messaging.onTokenRefresh.listen(callback);
  }
}
