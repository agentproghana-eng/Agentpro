import 'dart:io';

import 'package:agent_pro_ghana/core/services/high_amount_warning_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('high amount warning triggers only when amount exceeds the limit', () {
    expect(
      HighAmountWarningService.exceeds(amount: 1000.01, limit: 1000),
      isTrue,
    );

    expect(
      HighAmountWarningService.exceeds(amount: 1000, limit: 1000),
      isFalse,
    );

    expect(
      HighAmountWarningService.exceeds(amount: 999.99, limit: 1000),
      isFalse,
    );

    expect(
      HighAmountWarningService.exceeds(amount: 5000, limit: null),
      isFalse,
    );
  });

  test('warning uses the polished prompt box and concise wording', () {
    final warningUi =
        File('lib/shared/utils/high_amount_warning.dart').readAsStringSync();

    final promptDialog =
        File('lib/shared/widgets/app_prompt_dialog.dart').readAsStringSync();

    final settings =
        File('lib/features/settings/settings_screen.dart').readAsStringSync();

    final business =
        File('lib/features/transactions/transaction_screen.dart')
            .readAsStringSync();

    final personal =
        File('lib/features/transactions/personal_transaction_screen.dart')
            .readAsStringSync();

    expect(warningUi, contains('High amount'));
    expect(
      warningUi,
      contains('You are about to transfer ${_formatGhs(amount)},'),
    );
    expect(
      warningUi,
      contains('Would you like to continue?'),
    );
    expect(warningUi, contains('Edit amount'));
    expect(warningUi, contains('Continue'));
    expect(warningUi, contains('showAppPromptDialog'));

    expect(promptDialog, contains('class AppPromptDialog'));
    expect(promptDialog, contains('Future<bool> showAppPromptDialog'));

    expect(settings, contains("title: 'Transaction Safety'"));
    expect(settings, contains("title: 'High amount warning'"));
    expect(settings, contains('Warn above GHS'));

    expect(business, contains('confirmHighAmountIfNeeded'));

    expect(
      RegExp('confirmHighAmountIfNeeded').allMatches(personal).length,
      greaterThanOrEqualTo(3),
    );
  });
}
