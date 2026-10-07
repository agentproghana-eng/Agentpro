import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('zero-input Quick Action direct-start contract', () {
    late String businessDashboard;
    late String personalHome;
    late String router;
    late String businessTransaction;
    late String personalTransaction;

    setUpAll(() {
      businessDashboard = File(
        'lib/features/dashboard/widgets/dashboard_quick_actions_section.dart',
      ).readAsStringSync();

      personalHome = File(
        'lib/features/dashboard/personal_home_screen.dart',
      ).readAsStringSync();

      router = File(
        'lib/core/router/app_router.dart',
      ).readAsStringSync();

      businessTransaction = File(
        'lib/features/transactions/transaction_screen.dart',
      ).readAsStringSync();

      personalTransaction = File(
        'lib/features/transactions/personal_transaction_screen.dart',
      ).readAsStringSync();
    });

    test('business direct-start requires explicit empty V2 form schema', () {
      expect(
        businessDashboard,
        contains('definition.hasServerDrivenFormSchema'),
      );
      expect(
        businessDashboard,
        contains('definition.formFields.isEmpty'),
      );
      expect(
        businessDashboard,
        contains("query['auto_start'] = '1'"),
      );
    });

    test('personal direct-start requires explicit empty V2 form schema', () {
      expect(
        personalHome,
        contains('definition.hasServerDrivenFormSchema'),
      );
      expect(
        personalHome,
        contains('definition.formFields.isEmpty'),
      );
      expect(
        personalHome,
        contains("if (directStart) 'auto_start': '1'"),
      );
    });

    test('variant-dependent actions do not start until variant is resolved', () {
      expect(
        businessDashboard,
        contains('requiresBundleChoice'),
      );
      expect(
        businessDashboard,
        contains('requiresRecipientChoice'),
      );
      expect(
        businessDashboard,
        contains('variantResolved'),
      );

      expect(
        personalHome,
        contains('requiresBundleChoice'),
      );
      expect(
        personalHome,
        contains('requiresRecipientChoice'),
      );
      expect(
        personalHome,
        contains('variantResolved'),
      );
    });

    test('combined business workspaces cannot bypass their forms', () {
      expect(
        businessDashboard,
        contains('!isMtnAgentCashWorkspace'),
      );
      expect(
        businessDashboard,
        contains('!isMtnAgentPayToWorkspace'),
      );
      expect(
        businessDashboard,
        contains('!isTelecelMerchantECash'),
      );
      expect(
        businessDashboard,
        contains('!isTelecelMerchantSendMoney'),
      );
      expect(
        businessDashboard,
        contains('!isTelecelMerchantBankTransfer'),
      );
    });

    test('business route forwards direct-start explicitly', () {
      expect(
        router,
        contains(
          "state.uri.queryParameters['auto_start'] == '1'",
        ),
      );
      expect(
        router,
        contains('autoStart: autoStart'),
      );
    });

    test('auto-start waits for exact business SIM resolution', () {
      expect(
        businessTransaction,
        contains('widget.autoStart &&'),
      );
      expect(
        businessTransaction,
        contains('_simDetectionComplete &&'),
      );
      expect(
        businessTransaction,
        contains('_selectedSim != null'),
      );

      final loadIndex =
          businessTransaction.indexOf('Future<void> _loadSimMap()');
      final autoIndex = businessTransaction.indexOf(
        'if (false &&',
        loadIndex,
      );

      expect(loadIndex, greaterThanOrEqualTo(0));
      expect(autoIndex, greaterThan(loadIndex));
    });

    test('auto-start waits for exact Personal SIM resolution', () {
      expect(
        personalTransaction,
        contains('widget.autoStart &&'),
      );
      expect(
        personalTransaction,
        contains('_simDetectionComplete &&'),
      );
      expect(
        personalTransaction,
        contains('_selectedSim != null'),
      );

      final loadIndex =
          personalTransaction.indexOf('Future<void> _loadSimIdentity()');
      final autoIndex = personalTransaction.indexOf(
        'if (false &&',
        loadIndex,
      );

      expect(loadIndex, greaterThanOrEqualTo(0));
      expect(autoIndex, greaterThan(loadIndex));
    });

    test('direct-start reuses normal transaction initiation', () {
      expect(
        businessTransaction,
        contains('await _proceed();'),
      );
      expect(
        personalTransaction,
        contains('await _submit();'),
      );

      // Direct-start must not introduce a second native USSD execution
      // engine in either transaction form screen.
      expect(
        businessTransaction,
        isNot(contains("invokeMethod('dialUssd'")),
      );
      expect(
        personalTransaction,
        isNot(contains("invokeMethod('dialUssd'")),
      );
    });

    test('auto-start requires live preflight authorization', () {
      for (final screen in [
        businessTransaction,
        personalTransaction,
      ]) {
        expect(
          screen,
          contains('await _verifyZeroInputAutoStart()'),
        );
        expect(
          screen,
          contains('_autoStartPreflightApproved = true;'),
        );
        expect(
          screen,
          contains('_autoStartPreflightApproved = false;'),
        );
        expect(
          screen,
          contains('_autoStartFallbackToForm = true;'),
        );
      }
    });

    test('auto-start is single-attempt guarded', () {
      expect(
        businessTransaction,
        contains('_autoStartAttempted = true;'),
      );
      expect(
        personalTransaction,
        contains('_autoStartAttempted = true;'),
      );
    });

    test('auto-start hides unnecessary transaction forms', () {
      expect(
        businessTransaction,
        contains('body: false && widget.autoStart'),
      );
      expect(
        personalTransaction,
        contains('body: false && widget.autoStart'),
      );
      expect(
        businessTransaction,
        contains('CircularProgressIndicator()'),
      );
      expect(
        personalTransaction,
        contains('CircularProgressIndicator()'),
      );
    });
  });
}
