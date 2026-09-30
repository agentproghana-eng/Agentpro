import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  late String screen;
  late String migration;

  setUpAll(() {
    screen = File(
      'lib/features/transactions/transaction_screen.dart',
    ).readAsStringSync();

    migration = File(
      '../backend/migrations/161_telecel_merchant_data_live_flow.sql',
    ).readAsStringSync();
  });

  test('Merchant Data uses the business data_bundle identity', () {
    expect(
      migration,
      contains("transaction_type = 'data_bundle'"),
    );
    expect(
      migration,
      isNot(contains("transaction_type = 'buy_data'")),
    );
  });

  test('Merchant Data exposes Self and Other', () {
    expect(
      screen,
      contains("_telecelMerchantDataRecipientMode = 'self'"),
    );
    expect(screen, contains("value: 'self'"));
    expect(screen, contains("value: 'other'"));
    expect(screen, contains('My Number'));
    expect(screen, contains('Another Telecel Number'));
  });

  test('Other enables existing 10-digit customer phone validation', () {
    expect(
      screen,
      contains(
        '(!_isTelecelDataBundle || _isTelecelMerchantDataOther)',
      ),
    );
    expect(
      screen,
      contains("_telecelMerchantDataRecipientMode == 'other'"),
    );
    expect(screen, contains("RegExp(r'^\\d{10}\$')"));
  });

  test('recipient mode is propagated into exact flow resolution', () {
    expect(
      screen,
      contains('String? get _effectiveRecipientMode'),
    );
    expect(
      screen,
      contains('recipientMode: _effectiveRecipientMode'),
    );
    expect(
      screen,
      contains("'recipient_mode': _effectiveRecipientMode"),
    );
  });

  test(
    'recipient mode is included in transaction initiation payload',
    () {
      const requestBuilder =
          'Map<String, dynamic> _buildTransactionRequestFields';

      final start = screen.indexOf(requestBuilder);
      expect(start, greaterThanOrEqualTo(0));

      final end = screen.indexOf(
        'bool get _isTelecelMerchantBankTransfer',
        start,
      );
      expect(end, greaterThan(start));

      final requestSection = screen.substring(start, end);

      expect(
        requestSection,
        contains(
          "if (_effectiveRecipientMode != null)",
        ),
      );
      expect(
        requestSection,
        contains(
          "'recipient_mode': _effectiveRecipientMode",
        ),
      );
      expect(
        requestSection,
        contains(
          "if (_initialBundleCategory != null)",
        ),
      );
      expect(
        requestSection,
        contains(
          "'bundle_category': _initialBundleCategory",
        ),
      );
    },
  );

  test(
    'Merchant Data exposes only the live-confirmed category level',
    () {
      expect(screen, contains("labelText: 'Data Category'"));
      expect(screen, contains("value: '1'"));
      expect(screen, contains("Text('2Moorch No Expiry')"));
      expect(screen, contains("value: '2'"));
      expect(screen, contains("Text('Daily / Bossu')"));
      expect(screen, contains("value: '3'"));
      expect(screen, contains("Text('Weekly')"));
      expect(screen, contains("value: '4'"));
      expect(screen, contains("Text('Monthly / Jumbo')"));
      expect(screen, contains("value: '5'"));
      expect(screen, contains("Text('Night King')"));

      expect(
        screen,
        contains("'Select a data category'"),
      );

      // Go Back is a provider navigation action, not a
      // purchasable AgentPro category.
      expect(
        screen,
        isNot(contains("Text('Go Back')")),
      );
    },
  );

  test(
    'Merchant Data category feeds existing selection pipeline',
    () {
      final start = screen.indexOf(
        'List<String> get _telecelMerchantSelectionsInOrder',
      );
      expect(start, greaterThanOrEqualTo(0));

      final end = screen.indexOf(
        'bool get _isMtnCashInOutWorkspace',
        start,
      );
      expect(end, greaterThan(start));

      final selectionSection = screen.substring(start, end);

      expect(
        selectionSection,
        contains('if (_isTelecelMerchantData)'),
      );
      expect(
        selectionSection,
        contains('_telecelMerchantDataCategorySelection'),
      );
      expect(
        selectionSection,
        contains('<String>[category]'),
      );
    },
  );

  test('obsolete fixed Agent bundle catalogue is removed', () {
    expect(screen, isNot(contains('AgentTelecelBundleOption')));
    expect(screen, isNot(contains('kAgentTelecelBundles')));
    expect(screen, isNot(contains('_selectedTelecelBundle')));
    expect(
      screen,
      isNot(contains("labelText: 'Select Data Bundle'")),
    );
  });

  test('provider catalogue remains user controlled until PIN', () {
    expect(
      migration,
      contains("'await_user_selection'::ussd_flow_action"),
    );
    expect(migration, contains("'until_pin'"));
    expect(
      migration,
      contains("'pin_prompt'::ussd_flow_action"),
    );
    expect(
      migration,
      isNot(contains("'send_selection'::ussd_flow_action")),
    );
  });

  test('Merchant Data never submits PIN or Organisation Shortcode', () {
    expect(migration, isNot(contains("'send_pin'")));
    expect(
      migration,
      isNot(
        contains("'send_organisation_shortcode'::ussd_flow_action"),
      ),
    );
  });
}
