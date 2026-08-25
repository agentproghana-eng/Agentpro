import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Android notifications use the branded monochrome shield', () {
    final manifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();

    final icon = File(
      'android/app/src/main/res/drawable/ic_notification.xml',
    ).readAsStringSync();

    final service = File(
      'lib/core/services/notification_service.dart',
    ).readAsStringSync();

    expect(
      manifest,
      contains(
        'android:name="com.google.firebase.messaging.'
        'default_notification_icon"',
      ),
    );

    expect(manifest, contains('android:resource="@drawable/ic_notification"'));

    expect(icon, contains('AgentPro Ghana notification icon'));

    expect(icon, contains('android:fillColor="@android:color/white"'));

    expect(icon, contains('M12,2L20,5V11'));

    expect(icon, isNot(contains('simple wallet shape')));

    expect(
      service,
      contains(
        'AndroidInitializationSettings('
        "'@drawable/ic_notification')",
      ),
    );

    expect(service, contains("icon: '@drawable/ic_notification'"));
  });

  test('notification accent uses AgentPro primary teal', () {
    final colors = File(
      'android/app/src/main/res/values/colors.xml',
    ).readAsStringSync();

    final service = File(
      'lib/core/services/notification_service.dart',
    ).readAsStringSync();

    final theme = File('lib/shared/theme/app_theme.dart').readAsStringSync();

    expect(
      colors,
      contains(
        '<color name="notification_color">'
        '#00695C</color>',
      ),
    );

    expect(theme, contains('primaryColor = Color(0xFF00695C)'));

    expect(service, contains('color: const Color(0xFF00695C),'));

    expect(service, isNot(contains('color: const Color(0xFF006B5E),')));
  });
}
