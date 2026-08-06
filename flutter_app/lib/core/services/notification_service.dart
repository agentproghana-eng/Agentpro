import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/material.dart';

/// Background message handler — must be top-level function
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await NotificationService.showLocalNotification(message);
}

class NotificationService {
  static final _messaging = FirebaseMessaging.instance;
  static final _localNotifications = FlutterLocalNotificationsPlugin();

  static bool _initialized = false;
  static StreamSubscription<RemoteMessage>? _foregroundSubscription;
  static StreamSubscription<RemoteMessage>? _openedAppSubscription;

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

    // Handle a notification that launched the app from a fully
    // terminated state.
    final initialMessage = await _messaging.getInitialMessage();

    if (initialMessage != null) {
      _onMessageOpenedApp(initialMessage);
    }
  }

  static Future<void> _onForegroundMessage(RemoteMessage message) async {
    await showLocalNotification(message);
  }

  static Future<void> showLocalNotification(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    const androidDetails = AndroidNotificationDetails(
      _channelId,
      _channelName,
      channelDescription: _channelDesc,
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
      icon: '@drawable/ic_notification',
      color: Color(0xFF006B5E),
    );

    await _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      const NotificationDetails(android: androidDetails),
      payload: message.data['type'],
    );
  }

  static void _onNotificationTap(NotificationResponse response) {
    // Navigate based on notification type
    final type = response.payload;
    // Navigation is handled by GoRouter — store pending navigation
    _pendingNavigation = _routeForType(type);
  }

  static void _onMessageOpenedApp(RemoteMessage message) {
    final type = message.data['type'] as String?;
    _pendingNavigation = _routeForType(type);
  }

  static String? _pendingNavigation;

  static String? consumePendingNavigation() {
    final nav = _pendingNavigation;
    _pendingNavigation = null;
    return nav;
  }

  static String? _routeForType(String? type) {
    switch (type) {
      case 'transaction_success':
      case 'transaction_failed':
        return '/transactions';
      case 'low_float':
        return '/float';
      case 'subscription_reminder':
      case 'subscription_suspended':
      case 'renewal_approved':
        return '/subscription';
      case 'ad_approved':
      case 'ad_rejected':
      case 'ad_expiring':
      case 'ad_expired':
        return '/marketplace';
      default:
        return '/notifications';
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
