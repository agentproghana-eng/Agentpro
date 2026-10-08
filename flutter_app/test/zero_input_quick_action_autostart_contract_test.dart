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

    test('personal preflight exceptions fail closed', () {
      final start = personalTransaction.indexOf(
        'Future<bool> _verifyZeroInputAutoStart()',
      );
      final end = personalTransaction.indexOf(
        '// Retained while this screen',
        start,
      );

      expect(start, greaterThanOrEqualTo(0));
      expect(end, greaterThan(start));

      final method = personalTransaction.substring(start, end);

      expect(method, contains('try {'));
      expect(
        method,
        contains('await ZeroInputFlowPreflight.verify('),
      );
      expect(method, contains('} catch (_) {'));
      expect(method, contains('return false;'));

      final preflight = method.indexOf(
        'await ZeroInputFlowPreflight.verify(',
      );
      final catchBlock = method.indexOf('} catch (_) {');

      expect(preflight, greaterThan(method.indexOf('try {')));
      expect(catchBlock, greaterThan(preflight));
    });

    test('business auto-start rejects required transaction inputs', () {
      final start = businessTransaction.indexOf(
        'Future<bool> _verifyZeroInputAutoStart()',
      );
      final end = businessTransaction.indexOf(
        'void initState()',
        start,
      );

      expect(start, greaterThanOrEqualTo(0));

      final guard = end > start
          ? businessTransaction.substring(start, end)
          : businessTransaction.substring(start);

      for (final requirement in [
        '_usesServerDrivenForm',
        '_needsAmount',
        '_needsCustomer',
        '_needsRecipient',
        '_needsReference',
        '_needsMerchantId',
        '_needsTelecelMerchantReference',
        '_needsTelecelMerchantAccountNumber',
        '_isManualCashOut',
      ]) {
        expect(guard, contains(requirement));
      }

      expect(guard, contains('return false;'));

      final inputGuardEnd = guard.indexOf(
        'final selectedSim = _selectedSim;',
      );
      final preflightStart = guard.indexOf(
        'await ZeroInputFlowPreflight.verify(',
      );

      expect(inputGuardEnd, greaterThan(0));
      expect(preflightStart, greaterThan(inputGuardEnd));

      for (final requirement in [
        '_usesServerDrivenForm',
        '_needsAmount',
        '_needsCustomer',
        '_needsRecipient',
        '_needsReference',
        '_needsMerchantId',
        '_needsTelecelMerchantReference',
        '_needsTelecelMerchantAccountNumber',
        '_isManualCashOut',
      ]) {
        expect(
          guard.indexOf(requirement),
          lessThan(inputGuardEnd),
        );
      }
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
        'if (ZeroInputDirectExecutionPolicy.supportedTypes.contains(_transactionType) &&',
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
        'if (ZeroInputDirectExecutionPolicy.supportedTypes.contains(_effectiveTransactionType) &&',
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
        contains('body: ZeroInputDirectExecutionPolicy.supportedTypes.contains('),
      );
      expect(
        personalTransaction,
        contains('body: ZeroInputDirectExecutionPolicy.supportedTypes.contains('),
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
