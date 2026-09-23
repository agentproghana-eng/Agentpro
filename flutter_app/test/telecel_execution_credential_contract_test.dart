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

  test('protected cached flow fails closed', () {
    expect(
      progress.contains(
        'requires an online connection before USSD can start',
      ),
      isTrue,
    );
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
