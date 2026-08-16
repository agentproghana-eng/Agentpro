import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final transactionSource = File(
    'lib/features/transactions/personal_transaction_screen.dart',
  ).readAsStringSync();

  final homeSource = File(
    'lib/features/dashboard/personal_home_screen.dart',
  ).readAsStringSync();

  final routerSource = File(
    'lib/core/router/app_router.dart',
  ).readAsStringSync();

  test('Personal generic form keeps the verified input order', () {
    final network = transactionSource.indexOf(
      'if (_isMtnCrossNetwork)',
    );

    final phone = transactionSource.indexOf(
      'if (_needsPhone)',
      network,
    );

    final amount = transactionSource.indexOf(
      'if (_needsAmount)',
      phone,
    );

    final reference = transactionSource.indexOf(
      'if (_needsReference)',
      amount,
    );

    expect(network, greaterThanOrEqualTo(0));
    expect(phone, greaterThan(network));
    expect(amount, greaterThan(phone));
    expect(reference, greaterThan(amount));
  });

  test('Personal route carries exact physical SIM identity', () {
    expect(homeSource, contains("'sim_slot'"));
    expect(homeSource, contains("'sim_iccid'"));
    expect(homeSource, contains("'sim_subscription_id'"));

    expect(routerSource, contains("'sim_subscription_id'"));
    expect(routerSource, contains('simSubscriptionId:'));
  });

  test('Personal form locks provider and physical SIM', () {
    expect(
      transactionSource,
      contains("'sim_subscription_id': selectedSim.subscriptionId"),
    );

    expect(
      transactionSource,
      contains('The selected physical SIM is no longer available.'),
    );

    expect(
      transactionSource,
      contains(r"'$_providerLabel locked · Using SIM"),
    );

    expect(
      transactionSource,
      contains(r'Select physical $_providerLabel SIM'),
    );

    expect(transactionSource, contains('ChoiceChip('));

    expect(
      transactionSource,
      contains("purposes[sim.slot] != 'agent'"),
    );
  });

  test('locked SIM identity is sent to transaction progress', () {
    expect(
      transactionSource,
      contains("'sim_slot': selectedSim.slot"),
    );

    expect(
      transactionSource,
      contains("'sim_subscription_id': selectedSim.subscriptionId"),
    );
  });

  test('SIM lock is rendered above generic and data-bundle flows', () {
    final simSection = transactionSource.indexOf(
      '_buildLockedSimSection(context)',
    );

    final dataFlow = transactionSource.indexOf(
      '? _buildDataBundleFlow(context)',
    );

    final genericFlow = transactionSource.indexOf(
      ': _buildGenericForm(context, label)',
    );

    expect(simSection, greaterThanOrEqualTo(0));
    expect(dataFlow, greaterThan(simSection));
    expect(genericFlow, greaterThan(simSection));
  });
}
