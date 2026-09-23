import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final progress = File(
    'lib/features/transactions/transaction_progress_screen.dart',
  ).readAsStringSync();

  final service = File(
    'lib/core/services/ussd_service.dart',
  ).readAsStringSync();

  test('plaintext Telecel credential is not read from AuthBloc', () {
    expect(
      progress.contains("user['telecel_operator_id']"),
      isFalse,
    );
    expect(
      progress.contains('telecelOperatorId'),
      isFalse,
    );
  });

  test('resolved Business flow uses narrow execution endpoint', () {
    expect(
      progress.contains(
        "'/ussd-flows/execution-credentials'",
      ),
      isTrue,
    );
    expect(
      progress.contains("'flow_id': resolvedFlowId"),
      isTrue,
    );
    expect(
      progress.contains("'sim_role': role"),
      isTrue,
    );
  });

  test('client does not choose requested credential types', () {
    expect(
      progress.contains('required_credentials'),
      isFalse,
    );
  });

  test('protected Telecel execution requires online flow provenance', () {
    expect(
      RegExp(r'isOnlineResolvedFlow:\s*false').allMatches(progress).length,
      2,
    );
    expect(
      RegExp(r'isOnlineResolvedFlow:\s*true').allMatches(progress).length,
      1,
    );
    expect(
      progress.contains('required bool isOnlineResolvedFlow'),
      isTrue,
    );
    expect(
      progress.contains(
        'if (!isOnlineResolvedFlow || resolvedFlowId.isEmpty)',
      ),
      isTrue,
    );
    expect(
      progress.contains(
        'requires an online connection before USSD can start',
      ),
      isTrue,
    );

    final provenanceGuard = progress.indexOf(
      'if (!isOnlineResolvedFlow || resolvedFlowId.isEmpty)',
    );
    final credentialRequest = progress.indexOf(
      "'/ussd-flows/execution-credentials'",
    );

    expect(provenanceGuard, greaterThanOrEqualTo(0));
    expect(credentialRequest, greaterThan(provenanceGuard));
  });

  test('organisation shortcode reaches native channel', () {
    expect(
      service.contains('String? organisationShortcode'),
      isTrue,
    );
    expect(
      service.contains(
        "'organisation_shortcode': organisationShortcode",
      ),
      isTrue,
    );
  });

  test('missing shortcode is definite pre-dispatch failure', () {
    expect(
      service.contains(
        "'MISSING_ORGANISATION_SHORTCODE'",
      ),
      isTrue,
    );
  });
}
