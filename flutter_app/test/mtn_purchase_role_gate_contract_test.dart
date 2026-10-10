import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  late String source;

  setUpAll(() {
    source = File(
      'lib/features/transactions/transaction_screen.dart',
    ).readAsStringSync();
  });

  test('MTN Airtime and Data require a verified Agent SIM', () {
    expect(source, contains('bool get _isMtnPurchaseScreen'));
    expect(source, contains('bool get _mtnPurchaseRoleReady'));
    expect(
      source,
      contains('_verifiedBusinessRoleSimKey == _currentBusinessRoleSimKey'),
    );
    expect(
      source,
      contains('_selectedBusinessSimRole != null'),
    );
    expect(
      source,
      contains('body: _isMtnPurchaseScreen && !_mtnPurchaseRoleReady'),
    );
  });

  test('stale SIM role responses are rejected', () {
    expect(
      source,
      contains('final requestGeneration = ++_businessRoleRequestGeneration'),
    );
    expect(
      RegExp(
        r'requestGeneration != _businessRoleRequestGeneration',
      ).allMatches(source).length,
      2,
    );
  });

  test('Agent-only action buttons remain role-gated', () {
    expect(
      source,
      contains("_selectedBusinessSimRole == 'agent'"),
    );
  });

  test('role verification failure offers retry', () {
    expect(source, contains('Retry Verification'));
    expect(source, contains('Settings > SIM Purpose'));
  });

  test('purchase buttons retain their labels', () {
    expect(source, contains("label: 'Buy Airtime'"));
    expect(source, contains("label: 'Buy Data'"));
    expect(source, contains("'Airtime Balance'"));
    expect(source, contains("'Data Balance'"));
  });

  test('SIM role verification cannot use legacy fallback', () {
    expect(source, contains('allowLegacyAgentFallback: false'));
  });
}
