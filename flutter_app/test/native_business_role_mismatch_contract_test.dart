import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final service = File(
    'android/app/src/main/kotlin/'
    'com/agentpro/ghana/'
    'UssdAccessibilityService.kt',
  ).readAsStringSync();

  final channel = File(
    'android/app/src/main/kotlin/'
    'com/agentpro/ghana/'
    'UssdAccessibilityChannel.kt',
  ).readAsStringSync();

  final flutterEngine = File(
    'lib/core/services/ussd_service.dart',
  ).readAsStringSync();

  final progress = File(
    'lib/features/transactions/'
    'transaction_progress_screen.dart',
  ).readAsStringSync();

  test(
    'native session stores Business SIM role',
    () {
      expect(
        service,
        contains('pendingBusinessSimRole'),
      );

      expect(
        channel,
        contains(
          'call.argument<String>("sim_role")',
        ),
      );

      expect(
        channel,
        contains('normalizedBusinessSimRole'),
      );
    },
  );

  test(
    'known MTN wrong-role response stops automation',
    () {
      expect(
        service,
        contains(
          'not allowed to access this code',
        ),
      );

      expect(
        service,
        contains('"role_mismatch"'),
      );

      expect(
        service,
        contains('Select an MTN'),
      );
    },
  );

  test(
    'Flutter preserves sanitized role mismatch',
    () {
      expect(
        flutterEngine,
        contains(
          "'role_mismatch' => USSDStatus.failed",
        ),
      );

      expect(
        flutterEngine,
        contains('nativeMessage'),
      );
    },
  );

  test(
    'Business role reaches native automation',
    () {
      expect(
        flutterEngine,
        contains(
          "'sim_role': businessSimRole",
        ),
      );

      expect(
        progress,
        contains(
          'businessSimRole: expectedBusinessRole',
        ),
      );

      expect(
        progress,
        contains(
          'businessSimRole: businessSimRole',
        ),
      );
    },
  );
}
