import 'dart:io';

import 'package:agent_pro_ghana/features/ussd_flows/ussd_flow_draft_validation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  String source(String path) => File(path).readAsStringSync();

  const trustedTelecelBalance = {
    'provider': 'telecel',
    'transaction_type': 'check_airtime_balance',
    'dial_code': '*124#',
    'owner_user_id': null,
    'company_id': null,
    'steps': [
      {
        'match_all': ['main ac:'],
        'action': 'await_user_selection',
        'action_value': null,
      },
    ],
  };

  test('exact Global Telecel *124# balance shape is PIN-less', () {
    expect(
      isTrustedPinlessPersonalRuntimeFlow(
        isPersonal: true,
        provider: 'telecel',
        transactionType: 'check_airtime_balance',
        dialCode: '*124#',
        flowData: trustedTelecelBalance,
      ),
      isTrue,
    );
  });

  test('different Telecel *124# step shape is not trusted PIN-less', () {
    expect(
      isTrustedPinlessPersonalRuntimeFlow(
        isPersonal: true,
        provider: 'telecel',
        transactionType: 'check_airtime_balance',
        dialCode: '*124#',
        flowData: const {
          'provider': 'telecel',
          'transaction_type': 'check_airtime_balance',
          'dial_code': '*124#',
          'owner_user_id': null,
          'company_id': null,
          'steps': [
            {
              'match_all': ['main ac:'],
              'action': 'send_digit',
              'action_value': '1',
            },
          ],
        },
      ),
      isFalse,
    );
  });

  test('Personal-owned *124# override remains untrusted PIN-less', () {
    expect(
      isTrustedPinlessPersonalRuntimeFlow(
        isPersonal: true,
        provider: 'telecel',
        transactionType: 'check_airtime_balance',
        dialCode: '*124#',
        flowData: const {
          'provider': 'telecel',
          'transaction_type': 'check_airtime_balance',
          'dial_code': '*124#',
          'owner_user_id': 'personal-owner',
          'company_id': null,
          'steps': [
            {
              'match_all': ['main ac:'],
              'action': 'await_user_selection',
              'action_value': null,
            },
          ],
        },
      ),
      isFalse,
    );
  });

  test('combined Airtime and Data balance label is visible', () {
    final transactionScreen = source(
      'lib/features/transactions/personal_transaction_screen.dart',
    );

    final reports = source(
      'lib/features/reports/personal_reports_screen.dart',
    );

    expect(
      transactionScreen,
      contains(
        "'check_airtime_balance': "
        "'Check Airtime & Data Balance'",
      ),
    );

    expect(
      reports,
      contains(
        "'check_airtime_balance': "
        "'Check Airtime & Data Balance'",
      ),
    );
  });

  test('Telecel M4M is standalone and launches its direct Self flow', () {
    final transactionScreen = source(
      'lib/features/transactions/personal_transaction_screen.dart',
    );

    expect(
      transactionScreen,
      contains("'m4m_live'"),
    );

    expect(
      transactionScreen,
      contains("'M4M Live Offers'"),
    );

    expect(
      transactionScreen,
      contains('_isTelecelM4mQuickAction'),
    );

    expect(
      transactionScreen,
      contains("_bundleCategory = kTelecelM4mCategory.id;"),
    );

    expect(
      transactionScreen,
      contains("_dbStep = 'review';"),
    );

    expect(
      transactionScreen,
      isNot(
        contains('categories.add(kTelecelM4mCategory)'),
      ),
    );

    expect(
      transactionScreen,
      contains("? 'M4M'"),
    );

    expect(
      transactionScreen,
      isNot(contains('1.5GB @GHs3')),
    );

    expect(
      transactionScreen,
      isNot(contains('3.8GB @GHs7')),
    );
  });

  test('M4M UI explains live manual offer/payment selection', () {
    final transactionScreen = source(
      'lib/features/transactions/personal_transaction_screen.dart',
    );

    expect(
      transactionScreen,
      contains(
        'Telecel will show the current M4M offers.',
      ),
    );

    final normalizedM4mReviewSource = transactionScreen.replaceAll(
      RegExp(r"'\s*'"),
      '',
    );

    expect(
      normalizedM4mReviewSource,
      contains(
        'Airtime requires no PIN.',
      ),
    );

    expect(
      transactionScreen,
      contains(
        'Telecel Cash stops at the PIN screen',
      ),
    );
  });
  test('Telecel Personal Quick Actions expose M4M and Balance', () {
    final customization = source(
      'lib/features/ussd_settings/quick_action_customization_screen.dart',
    );

    final preferences = source(
      'lib/features/ussd_settings/quick_action_preference.dart',
    );

    final catalog = source(
      'lib/features/ussd_settings/quick_action_catalog.dart',
    );

    expect(
      customization,
      contains("'m4m_live'"),
    );

    expect(
      customization,
      contains("displayLabel: 'M4M'"),
    );

    expect(
      preferences,
      contains("? 'M4M'"),
    );

    expect(
      catalog,
      contains("return 'Balance';"),
    );
  });

  test('Telecel M4M Home tile preserves its exact flow variant', () {
    final home = source(
      'lib/features/dashboard/personal_home_screen.dart',
    );

    expect(
      home,
      contains("'bundle_category'"),
    );

    expect(
      home,
      contains("'recipient_mode'"),
    );

    expect(
      home,
      contains('preference.bundleCategory'),
    );

    expect(
      home,
      contains('preference.recipientMode'),
    );
  });

}
