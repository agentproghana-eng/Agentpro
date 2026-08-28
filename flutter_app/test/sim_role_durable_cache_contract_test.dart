import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final serviceSource = File(
    'lib/core/services/'
    'sim_role_assignment_service.dart',
  ).readAsStringSync();

  final settingsSource = File(
    'lib/features/settings/'
    'sim_purpose_settings_screen.dart',
  ).readAsStringSync();

  test(
    'role cache uses identity-bound v2 storage',
    () {
      expect(
        serviceSource,
        contains(
          'agentpro_sim_role_assignment_v2_',
        ),
      );

      expect(
        serviceSource,
        contains(
          'agentpro_sim_role_assignment_v1_',
        ),
      );

      expect(
        serviceSource,
        contains(
          'iccid:',
        ),
      );

      expect(
        serviceSource,
        contains(
          'unresolved:',
        ),
      );
    },
  );

  test(
    'successful SIM Purpose save caches physical identity',
    () {
      expect(
        settingsSource,
        contains(
          'simIccid: card.iccid',
        ),
      );

      expect(
        settingsSource,
        contains(
          'simSubscriptionId: card.subscriptionId',
        ),
      );

      expect(
        settingsSource,
        contains(
          'provider: card.network',
        ),
      );
    },
  );

  test(
    'server failure falls back only to trusted local assignment',
    () {
      expect(
        serviceSource,
        contains(
          'static Future<List<dynamic>?> _fetchServerPurposes()',
        ),
      );

      expect(
        serviceSource,
        contains(
          'if (serverPurposes == null)',
        ),
      );

      expect(
        serviceSource,
        contains(
          'return trustedCached;',
        ),
      );

      expect(
        serviceSource,
        contains(
          'cachedRoleForSlot(',
        ),
      );
    },
  );
}
