import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Crashlytics observability contract', () {
    late String pubspec;
    late String mainSource;
    late String rootGradle;
    late String appGradle;

    setUpAll(() {
      pubspec = File('pubspec.yaml').readAsStringSync();
      mainSource = File('lib/main.dart').readAsStringSync();
      rootGradle = File('android/build.gradle').readAsStringSync();
      appGradle = File('android/app/build.gradle').readAsStringSync();
    });

    test('declares Firebase Crashlytics dependency', () {
      expect(
        pubspec,
        contains('firebase_crashlytics: ^5.3.0'),
      );
    });

    test('configures Android Crashlytics build tooling', () {
      expect(
        rootGradle,
        contains(
          'com.google.firebase:firebase-crashlytics-gradle:3.0.8',
        ),
      );

      expect(
        appGradle,
        contains(
          'apply plugin: "com.google.firebase.crashlytics"',
        ),
      );
    });

    test('captures Flutter framework and root-isolate fatal errors', () {
      expect(
        mainSource,
        contains(
          "package:firebase_crashlytics/firebase_crashlytics.dart",
        ),
      );

      expect(
        mainSource,
        contains('FlutterError.onError ='),
      );

      expect(
        mainSource,
        contains('recordFlutterFatalError'),
      );

      expect(
        mainSource,
        contains('PlatformDispatcher.instance.onError ='),
      );

      expect(
        mainSource,
        contains('fatal: true'),
      );
    });

    test('does not collect production crash noise from debug builds', () {
      expect(
        mainSource,
        contains(
          'setCrashlyticsCollectionEnabled(',
        ),
      );

      expect(
        mainSource,
        contains('!kDebugMode'),
      );
    });

    test('keeps Firebase initialization off the startup critical path', () {
      final runAppOffset = mainSource.indexOf(
        'runApp(AgentProApp',
      );

      final firebaseOffset = mainSource.indexOf(
        "'Firebase services'",
      );

      expect(runAppOffset, greaterThanOrEqualTo(0));
      expect(firebaseOffset, greaterThan(runAppOffset));
    });
  });
}
