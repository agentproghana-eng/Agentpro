import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/core/services/offline_queue_service.dart',
  ).readAsStringSync();

  test(
    'Business flow cache identity includes operational SIM role',
    () {
      expect(
        source,
        contains("String businessSimRole = 'agent'"),
      );

      expect(
        source,
        contains('normalizedBusinessRole'),
      );

      expect(
        source,
        contains('if (!isPersonal)'),
      );
    },
  );

  test(
    'cache get and delete APIs all accept businessSimRole',
    () {
      final occurrences = RegExp(
        r"String businessSimRole = 'agent'",
      ).allMatches(source).length;

      expect(
        occurrences,
        greaterThanOrEqualTo(4),
        reason: '_flowKey, cacheFlow, getCachedFlow and '
            'deleteCachedFlow must all carry the role.',
      );
    },
  );

  test(
    'Personal cache identity does not require a Business role',
    () {
      expect(
        source,
        contains(
          "isPersonal ? 'personal' : 'business'",
        ),
      );

      expect(
        source,
        contains(
          'if (!isPersonal)',
        ),
      );
    },
  );
}
