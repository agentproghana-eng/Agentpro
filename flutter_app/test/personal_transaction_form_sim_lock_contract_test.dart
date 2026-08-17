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
    final form = transactionSource.indexOf(
      'Widget _buildGenericForm',
    );

    expect(form, greaterThanOrEqualTo(0));

    final network = transactionSource.indexOf(
      'if (_isMtnCrossNetwork)',
      form,
    );

    final phone = transactionSource.indexOf(
      'if (!_isMtnAirtime && _needsPhone)',
      form,
    );

    final amount = transactionSource.indexOf(
      'if (!_isMtnAirtime && _needsAmount)',
      form,
    );

    final reference = transactionSource.indexOf(
      'if (_needsReference)',
      form,
    );

    expect(network, greaterThan(form));
    expect(phone, greaterThan(network));
    expect(amount, greaterThan(phone));
    expect(reference, greaterThan(amount));
  });

  test('MTN Personal Airtime keeps the live-confirmed input order', () {
    final form = transactionSource.indexOf(
      'Widget _buildGenericForm',
    );

    expect(form, greaterThanOrEqualTo(0));

    final airtime = transactionSource.indexOf(
      'if (_isMtnAirtime) ...[',
      form,
    );

    final recipientChoice = transactionSource.indexOf(
      "labelText: 'Who is receiving the airtime?'",
      form,
    );

    final amount = transactionSource.indexOf(
      'controller: _amountCtrl',
      recipientChoice,
    );

    final conditionalPhone = transactionSource.indexOf(
      'if (_needsPhone) ...[',
      recipientChoice,
    );

    final genericNetwork = transactionSource.indexOf(
      'if (_isMtnCrossNetwork)',
      form,
    );

    expect(airtime, greaterThan(form));
    expect(recipientChoice, greaterThan(airtime));
    expect(amount, greaterThan(recipientChoice));
    expect(conditionalPhone, greaterThan(amount));
    expect(genericNetwork, greaterThan(conditionalPhone));

    expect(transactionSource, contains("value: 'self'"));
    expect(transactionSource, contains("value: 'other'"));
    expect(transactionSource, contains("child: Text('Myself')"));
    expect(transactionSource, contains("child: Text('Someone else')"));
  });

  test('Personal Send Money is grouped into one Home action', () {
    expect(
      homeSource,
      contains("actionKey == 'send_money_same_network'"),
    );
    expect(
      homeSource,
      contains("actionKey == 'send_money_cross_network'"),
    );
    expect(
      homeSource,
      contains("actionKey: 'send_money'"),
    );
    expect(
      homeSource,
      contains("customName: 'Send Money'"),
    );

    expect(
      transactionSource,
      contains("widget.transactionType == 'send_money'"),
    );
    expect(
      transactionSource,
      contains("labelText: 'Where are you sending?'"),
    );
    expect(
      transactionSource,
      contains("value: 'same_network'"),
    );
    expect(
      transactionSource,
      contains("value: 'other_network'"),
    );
    expect(
      transactionSource,
      contains("'same_network' => 'send_money_same_network'"),
    );
    expect(
      transactionSource,
      contains("'other_network' => 'send_money_cross_network'"),
    );
    expect(
      transactionSource,
      contains("'transaction_type': transactionType"),
    );
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
