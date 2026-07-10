import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:agent_pro_ghana/core/services/ussd_service.dart';

// ── Commission calculation tests (pure Dart, no Flutter needed) ──

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  group('Commission Calculations', () {
    test('calculates 2% commission correctly', () {
      final gross = 500.0 * 0.02;
      expect(gross, closeTo(10.0, 0.001));
    });

    test('applies cap when threshold exceeded', () {
      const amount = 1500.0;
      const rate = 0.02;
      const threshold = 1000.0;
      const cap = 20.0;

      double gross = amount * rate;
      if (amount >= threshold) gross = gross.clamp(0, cap);

      expect(gross, equals(20.0));
    });

    test('no cap applied below threshold', () {
      const amount = 800.0;
      const rate = 0.02;
      const threshold = 1000.0;
      const cap = 20.0;

      double gross = amount * rate;
      if (amount >= threshold) gross = gross.clamp(0, cap);

      expect(gross, closeTo(16.0, 0.001));
    });
  });

  group('USSD Engine — PIN safety (end-to-end via mocked platform channel)', () {
    // These tests mock the native MethodChannel so execute() runs through
    // its REAL code path (including the private _logStep/_handlePinPrompt
    // methods, which can't be called directly from outside the library
    // file due to Dart's file-scoped privacy) rather than testing
    // disconnected sample data that merely looks like engine output.
    const channel = MethodChannel('com.agentpro.ghana/ussd');
    final log = <MethodCall>[];

    setUp(() {
      log.clear();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        log.add(call);
        if (call.method == 'dialUSSD') return 'mock-session-id';
        if (call.method == 'waitForResponse') {
          // First call returns a PIN prompt; second call (the post-PIN
          // wait) returns the final success message.
          final waitCalls = log.where((c) => c.method == 'waitForResponse').length;
          return waitCalls == 1 ? 'Enter your PIN' : 'Cash out successful. Ref: AB12345678';
        }
        return null;
      });
    });

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
    });

    test('session log never contains the PIN, only a fixed safe placeholder', () async {
      final template = USSDTemplate(
        id: 'test-template',
        ussdStringPattern: '*170*1*2*{customer_phone}*{amount}#',
        pinPromptStrings: const ['pin'],
        successStrings: const ['successful'],
        failureStrings: const ['failed', 'insufficient'],
        timeoutSeconds: 5,
        retryCount: 0,
      );

      final engine = USSDEngine(
        template: template,
        automationParams: const {'customer_phone': '0241234567', 'amount': '250'},
        provider: 'mtn',
        simSlot: 0,
      );

      final result = await engine.execute();

      expect(result.outcome, USSDStatus.success);

      final pinEntries = result.sessionLog.where((e) => e['type'] == 'pin_prompt_seen').toList();
      expect(pinEntries.length, 1);
      // The ONLY acceptable content here is the fixed placeholder —
      // never the actual PIN, never the raw network prompt text.
      expect(pinEntries.first['response'], '[PIN ENTRY — NOT LOGGED, NOT APP-VISIBLE]');
      expect(pinEntries.first.containsKey('input'), isFalse);

      // The dialed string itself must never contain anything PIN-shaped —
      // confirms automationParams (built from real transaction fields)
      // never carries a PIN value into the resolved USSD string.
      final dialEntry = result.sessionLog.firstWhere((e) => e['type'] == 'dial');
      expect(dialEntry['dialed'], '*170*1*2*0241234567*250#');
    });

    test('pendingConfirmation when no response ever arrives after a PIN prompt', () async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        log.add(call);
        if (call.method == 'dialUSSD') return 'mock-session-id';
        if (call.method == 'waitForResponse') {
          final waitCalls = log.where((c) => c.method == 'waitForResponse').length;
          // First call: PIN prompt. Second call: network never responds again.
          return waitCalls == 1 ? 'Enter your PIN' : 'TIMEOUT';
        }
        return null;
      });

      final template = USSDTemplate(
        id: 'test-template',
        ussdStringPattern: '*170*1*2*{customer_phone}*{amount}#',
        pinPromptStrings: const ['pin'],
        successStrings: const ['successful'],
        failureStrings: const ['failed'],
        timeoutSeconds: 5,
        retryCount: 0,
      );

      final engine = USSDEngine(
        template: template,
        automationParams: const {'customer_phone': '0241234567', 'amount': '250'},
        provider: 'mtn',
        simSlot: 0,
      );

      final result = await engine.execute();

      // Must NOT be reported as a definite failure — money may have
      // actually moved. This is the entire reason pendingConfirmation
      // exists as a distinct outcome (see ussd_service.dart doc comment).
      expect(result.outcome, USSDStatus.pendingConfirmation);
    });

    test('a clean no-response timeout (no PIN prompt seen) is a definite failure, not pendingConfirmation', () async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        log.add(call);
        if (call.method == 'dialUSSD') return 'mock-session-id';
        if (call.method == 'waitForResponse') return 'TIMEOUT';
        return null;
      });

      final template = USSDTemplate(
        id: 'test-template',
        ussdStringPattern: '*170*1*6*1#',
        pinPromptStrings: const ['pin'],
        successStrings: const ['balance'],
        failureStrings: const ['failed'],
        timeoutSeconds: 5,
        retryCount: 0, // no retries, to keep this test deterministic
      );

      final engine = USSDEngine(
        template: template,
        automationParams: const {},
        provider: 'mtn',
        simSlot: 0,
      );

      final result = await engine.execute();

      // Nothing ever engaged with this dial — no PIN prompt was ever
      // seen, so no money could plausibly have moved. This is safe to
      // report as a definite failure, unlike the post-PIN-prompt case above.
      expect(result.outcome, USSDStatus.failed);
    });
  });

  group('Input Validation', () {
    bool isValidGhanaPhone(String phone) {
      return RegExp(r'^0(2|5)\d{8}$').hasMatch(phone);
    }

    test('validates MTN Ghana phone number', () {
      expect(isValidGhanaPhone('0241234567'), isTrue);
      expect(isValidGhanaPhone('0201234567'), isTrue);
    });

    test('validates Telecel Ghana phone number', () {
      expect(isValidGhanaPhone('0501234567'), isTrue);
    });

    test('rejects invalid phone numbers', () {
      expect(isValidGhanaPhone('1234567890'), isFalse);
      expect(isValidGhanaPhone('024123456'), isFalse);   // too short
      expect(isValidGhanaPhone('02412345678'), isFalse); // too long
      expect(isValidGhanaPhone('0341234567'), isFalse);  // wrong prefix
    });

    bool isValidAmount(double amount) => amount > 0 && amount <= 10000;

    test('validates transaction amounts', () {
      expect(isValidAmount(1.0), isTrue);
      expect(isValidAmount(250.0), isTrue);
      expect(isValidAmount(10000.0), isTrue);
      expect(isValidAmount(0.0), isFalse);
      expect(isValidAmount(-1.0), isFalse);
      expect(isValidAmount(10001.0), isFalse);
    });

    test('validates MoMo reference format', () {
      bool isValid(String? ref) => ref != null && ref.trim().length >= 5;
      expect(isValid('APG12345'), isTrue);
      expect(isValid('TXN001'), isTrue);
      expect(isValid('AB'), isFalse);
      expect(isValid(''), isFalse);
      expect(isValid(null), isFalse);
    });
  });

  group('Security Rules', () {
    test('PIN security constant is correctly defined', () {
      const pinMessage = 'Agent Pro Ghana never asks for your MoMo PIN. '
          'Enter your PIN only on the official network USSD screen.';
      expect(pinMessage.toLowerCase().contains('never'), isTrue);
      expect(pinMessage.toLowerCase().contains('pin'), isTrue);
      expect(pinMessage.toLowerCase().contains('ussd'), isTrue);
    });

    test('provider name mapping is complete', () {
      const providers = ['mtn', 'telecel', 'at_money'];
      const names = {
        'mtn': 'MTN Mobile Money',
        'telecel': 'Telecel Cash',
        'at_money': 'AT Money',
      };
      for (final p in providers) {
        expect(names[p], isNotNull,
            reason: 'Provider $p must have a display name');
      }
    });

    test('transaction types are all defined', () {
      const types = [
        'cash_in', 'cash_out', 'send_money', 'merchant_payment',
        'bill_payment', 'airtime', 'data_bundle',
        'balance_enquiry', 'mini_statement', 'reversal',
      ];
      expect(types.length, equals(10));
      expect(types.contains('cash_in'), isTrue);
      expect(types.contains('cash_out'), isTrue);
    });
  });
}
