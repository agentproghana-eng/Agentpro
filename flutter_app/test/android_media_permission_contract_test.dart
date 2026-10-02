import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('release manifest removes broad Android media permissions', () {
    final manifest =
        File('android/app/src/main/AndroidManifest.xml').readAsStringSync();

    final imagesPermission = RegExp(
      r'<uses-permission\s+android:name="android\.permission\.READ_MEDIA_IMAGES"\s+tools:node="remove"\s*/>',
      multiLine: true,
    );
    final videoPermission = RegExp(
      r'<uses-permission\s+android:name="android\.permission\.READ_MEDIA_VIDEO"\s+tools:node="remove"\s*/>',
      multiLine: true,
    );

    expect(imagesPermission.hasMatch(manifest), isTrue);
    expect(videoPermission.hasMatch(manifest), isTrue);
  });

  test('legacy external storage permissions remain API-bounded', () {
    final manifest =
        File('android/app/src/main/AndroidManifest.xml').readAsStringSync();

    expect(
      manifest,
      contains(
        '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"\n'
        '        android:maxSdkVersion="32" />',
      ),
    );
    expect(
      manifest,
      contains(
        '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"\n'
        '        android:maxSdkVersion="29" />',
      ),
    );
  });
}
