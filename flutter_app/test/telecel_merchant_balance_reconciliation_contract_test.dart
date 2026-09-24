import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  late String source;

  setUpAll(() {
    source = File(
      'lib/core/services/'
      'telecel_merchant_balance_reconciliation_service.dart',
    ).readAsStringSync();
  });

  test('uses the dedicated native Telecel balance channel', () {
    expect(
      source,
      contains(
        'com.agentpro.ghana/telecel_merchant_balance_sms',
      ),
    );

    expect(
      source,
      contains(
        'getPendingTelecelMerchantBalanceObservations',
      ),
    );

    expect(
      source,
      contains(
        'acknowledgeTelecelMerchantBalanceObservation',
      ),
    );
  });

  test('posts only to the dedicated backend ingestion route', () {
    expect(
      source,
      contains(
        '/transactions/telecel-merchant/'
        'balance-observations',
      ),
    );

    expect(source, isNot(contains('sim_wallet_id')));
    expect(source, isNot(contains('raw_sms')));
    expect(source, isNot(contains('sms_body')));
  });

  test('uses installation identity only for unresolved ICCID', () {
    expect(
      source,
      contains(
        'StorageService.getOrCreateInstallationId()',
      ),
    );

    expect(
      source,
      contains(
        "if (observation.simIccid.isEmpty) ...{",
      ),
    );

    expect(
      source,
      contains("'sim_subscription_id':"),
    );
  });

  test('processes native observations oldest first', () {
    expect(
      source,
      contains('final observation = pending.first;'),
    );

    expect(
      source,
      contains(
        'if (!accepted) {',
      ),
    );
  });

  test('acknowledges only after backend acceptance', () {
    final submitIndex =
        source.indexOf(
      'final accepted = await _submit(observation);',
    );

    final acceptedGuardIndex =
        source.indexOf(
      'if (!accepted)',
      submitIndex,
    );

    final ackIndex =
        source.indexOf(
      "'acknowledgeTelecelMerchantBalanceObservation'",
      acceptedGuardIndex,
    );

    expect(submitIndex, greaterThanOrEqualTo(0));
    expect(
      acceptedGuardIndex,
      greaterThan(submitIndex),
    );
    expect(ackIndex, greaterThan(acceptedGuardIndex));
  });

  test('requires HTTP 200 and success true before ACK', () {
    expect(
      source,
      contains('response.statusCode != 200'),
    );

    expect(
      source,
      contains("payload['success'] == true"),
    );
  });

  test('does not advance when native exact ACK fails', () {
    expect(
      source,
      contains(
        'if (!acknowledged) {',
      ),
    );
  });

  test('prevents overlapping FIFO processors', () {
    expect(source, contains('bool _processing = false;'));
    expect(source, contains('if (_processing) {'));
    expect(source, contains('_rerunRequested = true;'));
    expect(source, contains('_processing = true;'));
    expect(source, contains('_processing = false;'));
  });

  test('malformed native financial records fail closed', () {
    expect(
      source,
      contains(
        "RegExp(r'^[a-f0-9]{64}\$')",
      ),
    );

    expect(
      source,
      contains(
        r"r'^(?:0|[1-9]\d*)(?:\.\d{1,2})?$'",
      ),
    );
  });

  test('does not contain provider credentials or PIN', () {
    expect(
      source.toLowerCase(),
      isNot(contains('operator_id')),
    );

    expect(
      source.toLowerCase(),
      isNot(contains('organisation_shortcode')),
    );

    expect(
      source.toLowerCase(),
      isNot(contains("'pin'")),
    );
  });
}
