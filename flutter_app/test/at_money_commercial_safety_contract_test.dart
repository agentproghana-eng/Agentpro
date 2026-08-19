import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AT Money commercial safety', () {
    final constants = File(
      'lib/core/constants/app_constants.dart',
    ).readAsStringSync();

    test('AT Money provider dial code is *110#', () {
      expect(
        constants,
        contains("'at_money': '*110#'"),
      );

      expect(
        constants,
        isNot(
          contains("'at_money': '*500#'"),
        ),
      );
    });
  });
}
