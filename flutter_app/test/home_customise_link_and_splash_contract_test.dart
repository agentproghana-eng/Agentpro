import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('home shows a Customise Quick Actions link for the SIM purpose', () {
    final source = File(
      'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
    ).readAsStringSync();

    expect(source, contains("'Customise Quick Actions'"));
    expect(source, contains('_customiseLink(context, role)'));
    expect(source, contains('context.push(_customizeRoute(role))'));
  });

  test('Android 12 splash logo fits inside the circular mask', () {
    final xml = File(
      'android/app/src/main/res/drawable-v31/splash_icon_v31.xml',
    ).readAsStringSync();

    expect(xml, contains('android:width="132dp"'));
    expect(xml, contains('android:height="132dp"'));
    expect(xml, isNot(contains('176dp')));
  });
}
