import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  String source(String path) => File(path).readAsStringSync();

  test('Personal money wording is Transfer Money', () {
    final transaction = source(
      'lib/features/transactions/personal_transaction_screen.dart',
    );

    final preferences = source(
      'lib/features/ussd_settings/quick_action_preference.dart',
    );

    expect(transaction, contains("'send_money': 'Transfer Money'"));
    expect(
      transaction,
      contains("'send_money_same_network': 'Transfer Money · Same Network'"),
    );
    expect(
      transaction,
      contains("'send_money_cross_network': 'Transfer Money · Other Network'"),
    );
    expect(preferences, contains("customName: 'Transfer Money'"));
  });

  test('Subscriber customization uses real catalog providers and groups', () {
    final customization = source(
      'lib/features/ussd_settings/quick_action_customization_screen.dart',
    );

    expect(
      customization,
      contains('if (_isSubscriberRole && catalog != null)'),
    );
    expect(customization, contains("'Transfer Money'"));
    expect(customization, contains("'Buy Airtime'"));
    expect(customization, contains("'Buy Data'"));
    expect(customization, contains("'buy_mashup' => 'MashUp'"));
  });

  test('Personal flow presentation groups transfer and MashUp correctly', () {
    final grouping = source('lib/features/ussd_flows/ussd_flow_grouping.dart');

    expect(
      RegExp(
        r"'send_money_cross_network'\s*=>\s*'transfer_money'",
      ).hasMatch(grouping),
      isTrue,
    );
    expect(grouping, contains("'buy_mashup' => 'mashup'"));
    expect(grouping, contains("return 'Same Network'"));
    expect(grouping, contains("return 'Other Network'"));
  });

  test('Personal dashboard has no Shift surface', () {
    final dashboard = source('lib/features/dashboard/personal_dashboard.dart');
    final more = source('lib/features/dashboard/personal_more_tab.dart');

    expect(dashboard, isNot(contains('DashboardShiftCard')));
    expect(dashboard, isNot(contains('/shifts')));
    expect(more, isNot(contains('/shifts')));
    expect(more, isNot(contains("'Shift'")));
  });

  test('Business Shift tile and skeleton are compact', () {
    final shift = source(
      'lib/features/dashboard/widgets/dashboard_shift_card.dart',
    );

    final skeleton = source('lib/shared/widgets/dashboard_skeleton.dart');

    expect(shift, contains('vertical: 9'));
    expect(shift, contains('minimumSize: const Size(0, 32)'));
    expect(
      skeleton,
      contains('SkeletonBox(width: 32, height: 32, radius: 16)'),
    );
  });

  test('custom icon backgrounds use a light tint', () {
    final preference = source(
      'lib/features/ussd_settings/quick_action_preference.dart',
    );

    expect(preference, contains('customColor.withValues(alpha: 0.14)'));
  });

  test('Business and Personal Reports use compact professional hierarchy', () {
    final business = source('lib/features/reports/reports_screen.dart');

    final personal = source(
      'lib/features/reports/personal_reports_screen.dart',
    );

    expect(business, contains("'Business Reports'"));
    expect(
      business,
      contains('Filter activity, review the match count, then export.'),
    );
    expect(
      business,
      contains(
        'visualDensity: const VisualDensity(horizontal: -1, vertical: -1)',
      ),
    );

    expect(personal, contains("'Personal Reports'"));
    expect(personal, contains("'Report Filters'"));
    expect(personal, contains("'Activity Summary'"));
    expect(personal, contains("'Success rate'"));
    expect(personal, contains("'/personal-reports/transactions/summary'"));
    expect(
      personal,
      contains("'send_money_same_network': 'Transfer Money · Same Network'"),
    );
    expect(personal, contains("'buy_mashup': 'MashUp'"));
  });
}
