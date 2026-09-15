import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'shift history uses cursor pagination',
    () {
      final source = File(
        'lib/features/shifts/'
        'shift_history_screen.dart',
      ).readAsStringSync();

      expect(
        source,
        contains("'/shifts/cursor'"),
      );

      expect(
        source,
        contains("'cursor': _nextCursor"),
      );

      expect(
        source,
        contains(
          "pagination?['has_more'] == true",
        ),
      );

      expect(
        source,
        contains(
          "pagination?['next_cursor']",
        ),
      );

      expect(
        source,
        isNot(contains("'page': nextPage")),
      );
    },
  );
}
