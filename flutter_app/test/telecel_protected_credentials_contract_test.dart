import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'protected Telecel credential editing has isolated device auth',
    () {
      final biometric = File(
        'lib/core/services/biometric_service.dart',
      ).readAsStringSync();

      expect(
        biometric,
        contains('authenticateSensitiveAction'),
      );

      final sensitiveStart = biometric.indexOf(
        'authenticateSensitiveAction',
      );

      final unlockStart = biometric.indexOf(
        'authenticateToUnlock',
        sensitiveStart,
      );

      expect(sensitiveStart, greaterThanOrEqualTo(0));
      expect(unlockStart, greaterThan(sensitiveStart));

      final sensitiveBlock = biometric.substring(
        sensitiveStart,
        unlockStart,
      );

      expect(
        sensitiveBlock,
        contains('biometricOnly: false'),
      );

      expect(
        sensitiveBlock,
        isNot(contains('_pendingUnlockApproval')),
      );

      expect(
        sensitiveBlock,
        isNot(contains('DeviceAuthApproval')),
      );
    },
  );
}
