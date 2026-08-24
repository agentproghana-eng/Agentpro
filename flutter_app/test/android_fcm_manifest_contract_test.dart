import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'Android app manifest leaves FCM service ownership to FlutterFire',
    () {
      final manifest = File(
        'android/app/src/main/AndroidManifest.xml',
      );

      expect(
        manifest.existsSync(),
        isTrue,
      );

      final source = manifest.readAsStringSync();

      expect(
        source,
        isNot(
          contains(
            'com.google.firebase.messaging.FirebaseMessagingService',
          ),
        ),
        reason: 'Do not manually register FirebaseMessagingService. '
            'The Firebase SDK already provides its low-priority fallback '
            'and FlutterFire provides the application message service.',
      );

      expect(
        source,
        isNot(
          contains(
            'com.google.firebase.MESSAGING_EVENT',
          ),
        ),
        reason: 'The application manifest must not compete with FlutterFire '
            'for MESSAGING_EVENT.',
      );

      expect(
        source,
        contains(
          'com.google.firebase.messaging.'
          'default_notification_channel_id',
        ),
      );

      expect(
        source,
        contains(
          'agentpro_notifications',
        ),
      );

      expect(
        source,
        contains(
          'FLUTTER_NOTIFICATION_CLICK',
        ),
      );
    },
  );
}
