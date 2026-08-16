import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final progressSource = File(
    'lib/features/transactions/transaction_progress_screen.dart',
  ).readAsStringSync();

  test(
      'Personal runtime separates Global automation from custom override access',
      () {
    expect(
      progressSource,
      contains(
        'final automationEntitled = '
        "transaction['automation_entitled'] == true;",
      ),
    );

    expect(
      progressSource,
      contains(
        "transaction['personal_override_entitled'] == true",
      ),
    );
  });

  test('Free Personal never falls back to stale cached custom flow', () {
    expect(
      progressSource,
      contains(
        'widget.isPersonal && !personalOverrideEntitled',
      ),
    );

    expect(
      progressSource,
      contains('? null'),
    );
  });
}
