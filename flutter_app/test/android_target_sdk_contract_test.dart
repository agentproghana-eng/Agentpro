import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Android commercial launch SDK contract', () {
    late String gradle;

    setUpAll(() {
      gradle = File(
        'android/app/build.gradle',
      ).readAsStringSync();
    });

    test('compiles against Android API 36', () {
      expect(
        RegExp(r'compileSdk\s+36').hasMatch(gradle),
        isTrue,
      );
    });

    test('targets Android API 36', () {
      expect(
        RegExp(r'targetSdk\s+36').hasMatch(gradle),
        isTrue,
      );
    });

    test('does not regress to target API 34', () {
      expect(
        RegExp(r'targetSdk\s+34').hasMatch(gradle),
        isFalse,
      );
    });

    test('preserves Android 8 minimum for USSD support', () {
      expect(
        RegExp(r'minSdk\s+26').hasMatch(gradle),
        isTrue,
      );
    });
  });

  test(
    'login uses adaptive Android 16 system bar icon brightness',
    () {
      final loginSource = File(
        'lib/features/auth/login_screen.dart',
      ).readAsStringSync();

      expect(
        loginSource,
        contains('AnnotatedRegion<SystemUiOverlayStyle>'),
      );

      expect(
        loginSource,
        contains(
          'statusBarIconBrightness: '
          'isDark ? Brightness.light : Brightness.dark',
        ),
      );

      expect(
        loginSource,
        contains(
          'statusBarBrightness: '
          'isDark ? Brightness.dark : Brightness.light',
        ),
      );
    },
  );

  test(
    'AgentPro native SIM channel replaces broken sim_card_info plugin',
    () {
      final pubspec = File('pubspec.yaml').readAsStringSync();

      final registrant = File(
        'android/app/src/main/java/io/flutter/plugins/'
        'GeneratedPluginRegistrant.java',
      ).readAsStringSync();

      final service = File(
        'lib/core/services/sim_card_service.dart',
      ).readAsStringSync();

      final mainActivity = File(
        'android/app/src/main/kotlin/com/agentpro/ghana/'
        'MainActivity.kt',
      ).readAsStringSync();

      final nativeChannel = File(
        'android/app/src/main/kotlin/com/agentpro/ghana/'
        'SimInfoChannel.kt',
      ).readAsStringSync();

      expect(
        pubspec,
        isNot(contains('sim_card_info:')),
      );

      expect(
        registrant,
        isNot(contains('SimCardInfoPlugin')),
      );

      expect(
        service,
        contains(
          "MethodChannel('com.agentpro.ghana/sim')",
        ),
      );

      expect(
        service,
        contains(
          "invokeMethod<List>('getSimCards')",
        ),
      );

      expect(
        mainActivity,
        contains(
          'SimInfoChannel(this, '
          'flutterEngine.dartExecutor.binaryMessenger)',
        ),
      );

      expect(
        mainActivity,
        contains('register(SIM_CHANNEL)'),
      );

      expect(
        nativeChannel,
        contains(
          '"getSimCards" -> getSimCards(result)',
        ),
      );

      expect(
        nativeChannel,
        contains('activeSubscriptionInfoList'),
      );

      expect(
        nativeChannel,
        contains('setOf("62001")'),
      );

      expect(
        nativeChannel,
        contains('setOf("62002")'),
      );
    },
  );
}
