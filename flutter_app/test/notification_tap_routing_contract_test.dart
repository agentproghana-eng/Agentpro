import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _readSource(String path) {
  final file = File(path);

  expect(
    file.existsSync(),
    isTrue,
    reason: 'Expected production source file to exist: $path',
  );

  return file.readAsStringSync();
}

String _slice(
  String source,
  String startMarker,
  String endMarker,
) {
  final start = source.indexOf(startMarker);

  expect(
    start,
    greaterThanOrEqualTo(0),
    reason: 'Missing start marker: $startMarker',
  );

  final end = source.indexOf(endMarker, start);

  expect(
    end,
    greaterThan(start),
    reason: 'Missing end marker: $endMarker',
  );

  return source.substring(start, end);
}

void main() {
  group('Notification tap routing contracts', () {
    test(
      'background notification payload is not mirrored locally',
      () {
        final source = _readSource(
          'lib/core/services/notification_service.dart',
        );

        final backgroundHandler = _slice(
          source,
          'Future<void> firebaseMessagingBackgroundHandler(',
          'class NotificationService',
        );

        expect(
          backgroundHandler,
          contains('if (message.notification != null)'),
          reason: 'FCM notification payloads must use the canonical Android '
              'system notification while the app is backgrounded.',
        );

        expect(
          backgroundHandler,
          isNot(contains('showLocalNotification(message)')),
          reason: 'Background FCM notification payloads must not create a '
              'second local tray notification with a competing tap path.',
        );
      },
    );

    test(
      'Firebase and local notification taps publish a pending route',
      () {
        final source = _readSource(
          'lib/core/services/notification_service.dart',
        );

        final localTap = _slice(
          source,
          'static void _onNotificationTap(',
          'static void _onMessageOpenedApp(',
        );

        final firebaseTap = _slice(
          source,
          'static void _onMessageOpenedApp(',
          'static String? _pendingNavigation;',
        );

        final queue = _slice(
          source,
          'static void _queueNavigation(',
          'static String? consumePendingNavigation()',
        );

        expect(
          localTap,
          contains('response.payload?.trim()'),
          reason:
              'A local notification tap must recover its persisted routing payload.',
        );

        expect(
          localTap,
          contains(
            "payload.startsWith('/') ? payload : _routeForType(payload)",
          ),
          reason:
              'A local notification tap must preserve resolved routes while remaining compatible with older type-only payloads.',
        );

        expect(
          localTap,
          contains('_queueNavigation('),
          reason:
              'A local notification tap must create a router navigation request.',
        );

        expect(
          firebaseTap,
          contains("message.data['transaction_id']?.toString()"),
          reason:
              'An FCM transaction tap must preserve the transaction identity supplied by the backend.',
        );

        expect(
          firebaseTap,
          contains('transactionId: transactionId'),
          reason:
              'The transaction identity must participate in route resolution.',
        );

        expect(
          firebaseTap,
          contains('_queueNavigation('),
          reason:
              'An FCM background/terminated notification tap must create a router navigation request.',
        );

        expect(
          queue,
          contains('_pendingNavigation = route'),
          reason:
              'The route must remain pending until authenticated routing is ready.',
        );

        expect(
          queue,
          contains('_navigationRequests.add(route)'),
          reason:
              'A running app must be awakened immediately when a notification is tapped.',
        );
      },
    );

    test(
      'terminated local notification launch is preserved',
      () {
        final source = _readSource(
          'lib/core/services/notification_service.dart',
        );

        final initialization = _slice(
          source,
          'static Future<void> _initialize() async',
          'static Future<void> _onForegroundMessage',
        );

        expect(
          initialization,
          contains('getNotificationAppLaunchDetails()'),
          reason:
              'A local notification that launches a terminated app must not lose its tap payload.',
        );

        expect(
          initialization,
          contains(
            'localLaunchDetails?.didNotificationLaunchApp ?? false',
          ),
          reason:
              'NotificationService must detect a terminated launch caused by a local notification.',
        );

        expect(
          initialization,
          contains('_onNotificationTap(response)'),
          reason:
              'The terminated local-notification launch must enter the same pending navigation pipeline.',
        );

        final firebaseLaunch = initialization.indexOf(
          'if (initialMessage != null)',
        );

        final localLaunch = initialization.indexOf(
          'localLaunchDetails?.didNotificationLaunchApp ?? false',
        );

        expect(
          firebaseLaunch,
          lessThan(localLaunch),
          reason:
              'Firebase initial-message routing must take precedence so one launch is not routed twice.',
        );
      },
    );

    test(
      'app consumes notification route only after authenticated router readiness',
      () {
        final source = _readSource('lib/main.dart');

        expect(
          source,
          contains('NotificationService.navigationRequests.listen'),
          reason:
              'The running app must listen for notification navigation requests.',
        );

        expect(
          source,
          contains('authBloc.stream.listen'),
          reason:
              'A tap received before trusted unlock must be retried when authentication changes.',
        );

        final consumer = _slice(
          source,
          'void _consumePendingNotificationNavigation()',
          '@override\n  void dispose()',
        );

        expect(
          consumer,
          contains('authBloc.state is! AuthAuthenticated'),
          reason:
              'Locked, signed-out, and restoring sessions must not consume the pending route.',
        );

        expect(
          consumer,
          contains(
            'NotificationService.consumePendingNavigation()',
          ),
          reason:
              'The pending route must be consumed once authenticated routing is ready.',
        );

        expect(
          consumer,
          contains('router.go(route)'),
          reason: 'A consumed notification route must be handed to GoRouter.',
        );

        final authGuard = consumer.indexOf(
          'authBloc.state is! AuthAuthenticated',
        );
        final consume = consumer.indexOf(
          'NotificationService.consumePendingNavigation()',
        );

        expect(
          authGuard,
          lessThan(consume),
          reason:
              'Authentication must be checked before the pending notification route is consumed.',
        );
      },
    );

    test(
      'notification navigation subscriptions are disposed with the app',
      () {
        final source = _readSource('lib/main.dart');

        final dispose = _slice(
          source,
          'void dispose()',
          '@override\n  Widget build(',
        );

        expect(
          dispose,
          contains('_notificationNavigationSubscription?.cancel()'),
        );

        expect(
          dispose,
          contains('_notificationAuthSubscription?.cancel()'),
        );
      },
    );
  });
}
