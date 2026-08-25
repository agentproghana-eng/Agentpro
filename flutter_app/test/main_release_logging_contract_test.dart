import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/main.dart',
  ).readAsStringSync();

  test(
    'release startup does not expose raw initialization failures',
    () {
      expect(
        source.contains(
          "import 'package:flutter/foundation.dart';",
        ),
        isTrue,
      );

      expect(
        source.contains(
          'if (kDebugMode)',
        ),
        isTrue,
      );

      expect(
        source.contains(
          r'$error',
        ),
        isFalse,
      );

      expect(
        source.contains(
          r'$stackTrace',
        ),
        isFalse,
      );
    },
  );

  test(
    'debug startup message contains service context only',
    () {
      expect(
        source.contains(
          r"'$serviceName initialization failed'",
        ),
        isTrue,
      );
    },
  );
}
