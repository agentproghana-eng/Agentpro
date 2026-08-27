import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  String source(String path) => File(path).readAsStringSync();

  test('Subscriber Quick Actions expose one semantic tile per service', () {
    final customization = source(
      'lib/features/ussd_settings/quick_action_customization_screen.dart',
    );

    final preference = source(
      'lib/features/ussd_settings/quick_action_preference.dart',
    );

    expect(
      customization,
      contains('type: \'send_money\''),
    );

    expect(
      customization,
      contains('displayLabel: \'Transfer Money\''),
    );

    expect(
      customization,
      contains('\'buy_data\' => \'Buy Data\''),
    );

    expect(
      customization,
      contains('\'buy_mashup\' => \'MashUp\''),
    );

    expect(
      customization,
      isNot(
        contains(
          '\'buy_data\' || \'buy_mashup\' => \'Buy Data\'',
        ),
      ),
    );

    expect(
      preference,
      contains('customName: \'Transfer Money\''),
    );

    expect(
      preference,
      contains(
        'customName: existingName == null || existingName.isEmpty',
      ),
    );

    expect(
      preference,
      contains('clearBundleCategory: true'),
    );

    expect(
      preference,
      contains('clearRecipientMode: true'),
    );
  });

  test('MashUp is separate from Buy Data throughout Personal UI', () {
    final transaction = source(
      'lib/features/transactions/personal_transaction_screen.dart',
    );

    final reports = source(
      'lib/features/reports/personal_reports_screen.dart',
    );

    final grouping = source(
      'lib/features/ussd_flows/ussd_flow_grouping.dart',
    );

    expect(
      transaction,
      contains('\'buy_mashup\': \'MashUp\''),
    );

    expect(
      reports,
      contains('\'buy_mashup\': \'MashUp\''),
    );

    expect(
      grouping,
      contains('\'buy_mashup\' => \'mashup\''),
    );

    expect(
      grouping,
      isNot(
        contains('\'buy_mashup\' => \'buy_data\''),
      ),
    );
  });

  test('USSD Automation no longer exposes legacy pattern overrides', () {
    final settings = source(
      'lib/features/ussd_settings/ussd_settings_screen.dart',
    );

    expect(
      settings,
      contains('Direct USSD String'),
    );

    expect(
      settings,
      contains('Interactive Flow'),
    );

    expect(
      settings,
      contains('\'Manage Automations\''),
    );

    expect(
      settings,
      contains('UssdFlowListScreen('),
    );

    expect(
      settings,
      isNot(contains('/ussd-overrides')),
    );

    expect(
      settings,
      isNot(contains('Your USSD Pattern')),
    );

    expect(
      settings,
      isNot(contains('Save Custom Pattern')),
    );

    expect(
      settings,
      isNot(contains('_patternCtrl')),
    );

    expect(
      settings,
      isNot(contains('_overrides')),
    );

    expect(
      settings,
      isNot(contains('_capabilities')),
    );
  });

  test('duplicate Custom USSD Flows entries are removed from More', () {
    final personalMore = source(
      'lib/features/dashboard/personal_more_tab.dart',
    );

    final owner = source(
      'lib/features/dashboard/owner_dashboard.dart',
    );

    expect(
      personalMore,
      isNot(contains('\'Custom USSD Flows\'')),
    );

    expect(
      owner,
      isNot(contains('\'Custom USSD Flows\'')),
    );
  });

  test('PDF footer is drawn inside the usable first page', () {
    final reports = source(
      '../backend/src/services/reportService.js',
    );

    expect(
      reports,
      contains('const footerY = doc.page.height - 55;'),
    );

    expect(
      reports,
      isNot(
        contains(
          r'.text(`Page ${pageNum}`, 40, doc.page.height - 30',
        ),
      ),
    );
  });
}
