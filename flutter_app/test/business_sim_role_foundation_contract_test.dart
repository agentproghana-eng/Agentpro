import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'Agent EVD and Merchant are Business roles',
    () {
      final source = File(
        'lib/shared/models/sim_role.dart',
      ).readAsStringSync();

      expect(
        source,
        contains('SimRole.agent => true'),
      );

      expect(
        source,
        contains('SimRole.evd => true'),
      );

      expect(
        source,
        contains('SimRole.merchant => true'),
      );

      expect(
        source,
        contains('SimRole.subscriber => false'),
      );
    },
  );

  test(
    'SIM service supports multiple SIMs for one provider',
    () {
      final source = File(
        'lib/core/services/sim_card_service.dart',
      ).readAsStringSync();

      expect(
        source,
        contains('getSimsForProvider'),
      );

      expect(
        source,
        contains('getProviderSimGroups'),
      );
    },
  );

  test(
    'USSD Automation exposes the four Quick Action profiles',
    () {
      final source = File(
        'lib/features/ussd_settings/ussd_settings_screen.dart',
      ).readAsStringSync();

      expect(source, contains("title: const Text('Agent')"));
      expect(source, contains("title: const Text('EVD')"));
      expect(source, contains("title: const Text('Merchant')"));
      expect(source, contains("title: const Text('Subscriber')"));
    },
  );
}
