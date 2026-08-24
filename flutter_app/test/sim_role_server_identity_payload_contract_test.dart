import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('SIM Purpose save sends durable physical identity', () {
    final source = File(
      'lib/features/settings/'
      'sim_purpose_settings_screen.dart',
    ).readAsStringSync();

    expect(source, contains('StorageService.getOrCreateInstallationId'));

    expect(source, contains("'installation_id': installationId"));

    expect(source, contains("'sim_subscription_id': card.subscriptionId"));
  });
}
