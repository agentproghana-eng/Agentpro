import 'dart:async';
import 'package:flutter/services.dart';

/// USSD Automation Engine
///
/// Executes USSD transactions by resolving a template's pattern string
/// (e.g. '*170*1*2*{customer_phone}*{amount}#') and dialing it as ONE
/// request via Android's TelephonyManager.sendUssdRequest().
///
/// ── WHY A SINGLE DIAL, NOT STEP-BY-STEP MENU NAVIGATION ──
/// Android's public USSD API is single request -> single response. It
/// has no mechanism for a third-party app to reply to an already-open
/// interactive USSD session (confirmed against multiple independent
/// sources; see migration 002_ussd_single_dial_redesign.sql for the
/// full explanation). Single-dial-compatible flows use that public API.
/// Interactive provider flows that cannot be represented safely as one
/// concatenated dial are handled separately below by
/// [UssdAccessibilityEngine].
///
/// ── CRITICAL SECURITY RULE ──
/// This engine NEVER requests, captures, logs, or transmits a MoMo PIN.
/// The PIN is never part of the dialed string. If the network's
/// response indicates a PIN prompt, the engine pauses — the PIN
/// exchange happens entirely at the OS/network level, outside this
/// app's code, and the app has no way to see or interfere with it.
///
/// ── HONEST UNCERTAINTY: WHAT HAPPENS AFTER A PIN PROMPT ──
/// Whether Android's UssdResponseCallback fires a second time with the
/// true final result after a PIN prompt resolves is not something this
/// engine can assume — it varies by OEM/Android version and has not
/// been confirmed for MTN/Telecel/AT specifically. If no further
/// response arrives after a PIN prompt was seen, this engine reports
/// `pendingConfirmation` rather than guessing success or failure —
/// forcing a false binary here could tell an agent a real transaction
/// failed when money actually moved, or vice versa.

enum USSDStatus {
  idle,
  dialing,
  awaitingPIN, // User must enter PIN on the OS/network's own prompt
  processing,
  success,
  failed,
  pendingConfirmation, // Genuinely unknown outcome — needs manual verification
}

class USSDTemplate {
  final String id;
  final String ussdStringPattern; // e.g. '*170*1*2*{customer_phone}*{amount}#'
  final List<String> pinPromptStrings;
  final List<String> successStrings;
  final List<String> failureStrings;
  final int timeoutSeconds;
  final int retryCount;

  const USSDTemplate({
    required this.id,
    required this.ussdStringPattern,
    required this.pinPromptStrings,
    required this.successStrings,
    required this.failureStrings,
    required this.timeoutSeconds,
    required this.retryCount,
  });

  factory USSDTemplate.fromMap(Map<String, dynamic> map) {
    return USSDTemplate(
      id: map['id'] ?? '',
      ussdStringPattern: map['ussd_string_pattern'] ?? '',
      pinPromptStrings: List<String>.from(
        map['pin_prompt_strings'] ?? const ['pin'],
      ),
      successStrings: List<String>.from(map['success_strings'] ?? const []),
      failureStrings: List<String>.from(map['failure_strings'] ?? const []),
      timeoutSeconds: map['timeout_seconds'] ?? 30,
      retryCount: map['retry_count'] ?? 2,
    );
  }
}

class USSDProgress {
  final USSDStatus status;
  final String message;

  const USSDProgress({required this.status, required this.message});
}

class USSDResult {
  final USSDStatus outcome; // success, failed, or pendingConfirmation
  final String? networkReference;
  final String? failureReason;
  final List<Map<String, dynamic>> sessionLog; // NEVER contains PIN

  const USSDResult({
    required this.outcome,
    this.networkReference,
    this.failureReason,
    required this.sessionLog,
  });

  bool get success => outcome == USSDStatus.success;
}

class USSDEngine {
  static const _channel = MethodChannel('com.agentpro.ghana/ussd');

  final USSDTemplate template;
  final Map<String, String> automationParams;
  final String provider; // 'mtn', 'telecel', 'at_money'
  final int simSlot; // 0 or 1

  final _progressController = StreamController<USSDProgress>.broadcast();
  Stream<USSDProgress> get progressStream => _progressController.stream;

  final List<Map<String, dynamic>> _sessionLog = [];

  USSDEngine({
    required this.template,
    required this.automationParams,
    required this.provider,
    required this.simSlot,
  });

  /// Execute the transaction: resolve the pattern, dial once, interpret
  /// the response (or lack of one) into a definite outcome. Retries
  /// (per template.retryCount) apply ONLY when the network never
  /// responded at all to the initial dial — in that case nothing
  /// engaged with the request, so no money could plausibly have moved,
  /// and a clean retry is safe. Once a PIN prompt has been seen, this
  /// method NEVER retries automatically under any circumstance — the
  /// network has already engaged with the request at that point, and
  /// an automatic retry could mean genuinely double-submitting a
  /// transaction that already succeeded. That specific ambiguity is
  /// reported as pendingConfirmation instead, for a human to resolve.
  Future<USSDResult> execute() async {
    final resolvedCode = _resolvePattern(template.ussdStringPattern);

    if (resolvedCode.isEmpty || !_allPlaceholdersResolved(resolvedCode)) {
      return USSDResult(
        outcome: USSDStatus.failed,
        failureReason:
            'USSD template is misconfigured for this transaction type. '
            'Please contact support.',
        sessionLog: _sessionLog,
      );
    }

    final maxAttempts = 1 + (template.retryCount.clamp(0, 3));

    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        _emitProgress(
          USSDStatus.dialing,
          attempt == 1
              ? 'Dialing network...'
              : 'Dialing network... (attempt $attempt of $maxAttempts)',
        );

        final sessionId = await _dialUSSD(resolvedCode);
        _logStep('dial', resolvedCode);

        _emitProgress(USSDStatus.processing, 'Processing transaction...');
        final firstResponse = await _waitForUSSDResponse(
          sessionId,
          template.timeoutSeconds,
        );
        _logStep('response', null, firstResponse);

        final gotNoResponseAtAll =
            firstResponse.isEmpty || firstResponse == 'TIMEOUT';

        if (gotNoResponseAtAll) {
          // Nothing engaged with this dial at all — safe to retry, since
          // no money could plausibly have moved. Only retry if attempts remain.
          if (attempt < maxAttempts) {
            _logStep(
              'retry',
              null,
              'No response — retrying (attempt $attempt of $maxAttempts)',
            );
            continue;
          }
          return USSDResult(
            outcome: USSDStatus.failed,
            failureReason:
                'No response received from the network after $maxAttempts attempt(s). '
                'Please check network signal and try again.',
            sessionLog: _sessionLog,
          );
        }

        if (_matches(firstResponse, template.successStrings)) {
          _emitProgress(USSDStatus.success, 'Transaction successful!');
          return USSDResult(
            outcome: USSDStatus.success,
            networkReference: _extractNetworkReference(firstResponse),
            sessionLog: _sessionLog,
          );
        }

        if (_matches(firstResponse, template.failureStrings)) {
          // A definite negative outcome from the network — never retried
          // automatically. Retrying an explicit "insufficient funds" or
          // "invalid recipient" would just fail identically again, and
          // silently redialing after a clear failure message is confusing
          // for the agent watching the screen.
          return USSDResult(
            outcome: USSDStatus.failed,
            failureReason: 'The network reported that the transaction failed.',
            sessionLog: _sessionLog,
          );
        }

        if (_matches(firstResponse, template.pinPromptStrings)) {
          return await _handlePinPrompt(sessionId);
        }

        // The network responded with something, but it matches none of
        // our known patterns. It DID engage with the request (unlike the
        // no-response case above), so we cannot assume it's safe to
        // retry — genuinely unknown outcomes are never retried.
        return USSDResult(
          outcome: USSDStatus.pendingConfirmation,
          failureReason: 'The network returned an unrecognized response. '
              'Please verify manually before repeating this transaction.',
          sessionLog: _sessionLog,
        );
      } catch (e) {
        if (attempt < maxAttempts) {
          _logStep('retry', null, 'Exception on attempt $attempt: $e');
          continue;
        }
        return USSDResult(
          outcome: USSDStatus.failed,
          failureReason: 'USSD automation could not complete.',
          sessionLog: _sessionLog,
        );
      }
    }

    // Unreachable in practice (the loop always returns or continues),
    // but required for type-soundness.
    return USSDResult(
      outcome: USSDStatus.failed,
      failureReason: 'Unexpected error: exhausted retries without a result.',
      sessionLog: _sessionLog,
    );
  }

  /// Handles the PIN-prompt branch in isolation, since it has its own
  /// two-phase wait and must NEVER be reached by the retry loop above
  /// once entered — see execute()'s doc comment for why.
  Future<USSDResult> _handlePinPrompt(String sessionId) async {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECURITY: PIN PROMPT DETECTED — ENGINE NEVER TOUCHES THIS
    // The OS/network handle PIN entry and submission entirely
    // outside this app's code. We only wait to see whether a
    // further response ever reaches our callback.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    _emitProgress(
      USSDStatus.awaitingPIN,
      'Enter your PIN on the network screen to complete this transaction.',
    );
    _logStep(
      'pin_prompt_seen',
      null,
      '[PIN ENTRY — NOT LOGGED, NOT APP-VISIBLE]',
    );

    // Extended wait: give the user real time to enter their PIN.
    // We deliberately do NOT know whether a second callback is
    // guaranteed to arrive — see the class-level doc comment.
    final secondResponse = await _waitForUSSDResponse(
      sessionId,
      _pinEntryTimeoutSeconds,
    );

    if (secondResponse.isEmpty || secondResponse == 'TIMEOUT') {
      // No further response ever arrived. We cannot know whether
      // the transaction succeeded after PIN entry — do NOT report
      // this as a definite failure, since money may have moved.
      // NEVER retry from here — see execute()'s doc comment.
      return USSDResult(
        outcome: USSDStatus.pendingConfirmation,
        failureReason: 'Could not confirm the outcome after PIN entry. '
            'Please verify with the customer or check your transaction '
            'history before repeating this transaction.',
        sessionLog: _sessionLog,
      );
    }

    _logStep('final_response', null, secondResponse);

    if (_matches(secondResponse, template.successStrings)) {
      _emitProgress(USSDStatus.success, 'Transaction successful!');
      return USSDResult(
        outcome: USSDStatus.success,
        networkReference: _extractNetworkReference(secondResponse),
        sessionLog: _sessionLog,
      );
    }
    if (_matches(secondResponse, template.failureStrings)) {
      return USSDResult(
        outcome: USSDStatus.failed,
        failureReason: 'The network reported that the transaction failed.',
        sessionLog: _sessionLog,
      );
    }

    // Got a second response, but it matches neither known success
    // nor failure pattern. Still don't guess — require manual
    // verification without exposing or persisting the raw provider text.
    return USSDResult(
      outcome: USSDStatus.pendingConfirmation,
      failureReason: 'The network returned an unrecognized response. '
          'Please verify manually before repeating this transaction.',
      sessionLog: _sessionLog,
    );
  }

  // Longer timeout specifically for the post-PIN wait, since this
  // includes real human data-entry time, not just network latency.
  static const _pinEntryTimeoutSeconds = 20;

  // ── Native method calls ──────────────────────────────────────

  Future<String> _dialUSSD(String ussdCode) async {
    return await _channel.invokeMethod('dialUSSD', {
      'ussd_code': ussdCode,
      'sim_slot': simSlot,
    });
  }

  Future<String> _waitForUSSDResponse(
    String sessionId,
    int timeoutSeconds,
  ) async {
    final result = await _channel.invokeMethod('waitForResponse', {
      'session_id': sessionId,
      'timeout_seconds': timeoutSeconds,
    });
    return result as String? ?? '';
  }

  // ── Helpers ──────────────────────────────────────────────────

  bool _matches(String response, List<String> patterns) {
    if (response.isEmpty) return false;
    final lower = response.toLowerCase();
    return patterns.any((p) => lower.contains(p.toLowerCase()));
  }

  String? _extractNetworkReference(String response) {
    final patterns = [
      RegExp(r'Transaction ID[:\s]+([A-Z0-9]+)', caseSensitive: false),
      RegExp(r'Ref[:\s]+([A-Z0-9]+)', caseSensitive: false),
      RegExp(r'([A-Z]{2}[0-9]{8,})', caseSensitive: false),
    ];
    for (final pattern in patterns) {
      final match = pattern.firstMatch(response);
      if (match != null) return match.group(1);
    }
    return null;
  }

  /// Substitute {placeholder} tokens with real values. Deliberately has
  /// no path that could ever substitute a PIN — no PIN value is ever
  /// passed into automationParams in the first place (see
  /// TransactionScreen / TransactionProgressScreen: there is no PIN
  /// text field anywhere in this app).
  String _resolvePattern(String pattern) {
    var resolved = pattern;
    automationParams.forEach((key, value) {
      resolved = resolved.replaceAll('{$key}', value);
    });
    return resolved;
  }

  /// Guards against dialing a string that still has an unresolved
  /// {placeholder} in it (e.g. a required field the caller forgot to
  /// supply) — dialing that literally would fail confusingly on the
  /// network side instead of failing clearly here.
  bool _allPlaceholdersResolved(String resolved) {
    return !RegExp(r'\{[a-z_]+\}').hasMatch(resolved);
  }

  void _emitProgress(USSDStatus status, String message) {
    if (!_progressController.isClosed) {
      _progressController.add(USSDProgress(status: status, message: message));
    }
  }

  // Diagnostic logs intentionally contain metadata only. Never persist
  // the resolved USSD dial string or raw network response here: either
  // can contain phone numbers, amounts, references, account details or
  // other transaction-specific customer data.
  void _logStep(String type, String? dialedCode, [String? response]) {
    _sessionLog.add({
      'type': type,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  void dispose() {
    if (!_progressController.isClosed) _progressController.close();
  }
}

/// Interactive USSD Accessibility Engine
///
/// Handles provider flows that require step-by-step interaction with the
/// system USSD dialog rather than a single concatenated dial. Proven legacy
/// MTN/Telecel paths coexist with the generic data-driven Flow Builder
/// interpreter. Delegates to UssdAccessibilityService via the native platform
/// channel, which reads and responds to the real system USSD dialog
/// screen by screen. This class never touches the PIN - once the
/// service reports the PIN prompt was reached, the agent completes it
/// on the same visible system dialog themselves.
class UssdAccessibilityEngine {
  static const _channel = MethodChannel(
    'com.agentpro.ghana/ussd_accessibility',
  );

  final _progressController = StreamController<USSDProgress>.broadcast();
  Stream<USSDProgress> get progressStream => _progressController.stream;

  Completer<USSDResult>? _resultCompleter;
  Timer? _prePinTimeout;
  Timer? _postPinTimeout;
  bool _pinPromptReached = false;

  UssdAccessibilityEngine() {
    _channel.setMethodCallHandler(_handleNativeCall);
  }

  Future<dynamic> _handleNativeCall(MethodCall call) async {
    switch (call.method) {
      case 'onPinPromptReached':
        _pinPromptReached = true;
        _prePinTimeout?.cancel();
        _prePinTimeout = null;

        _postPinTimeout?.cancel();
        _postPinTimeout = Timer(const Duration(seconds: 20), () async {
          final completer = _resultCompleter;

          if (completer == null || completer.isCompleted) {
            return;
          }

          await cancelAutomation();

          if (!completer.isCompleted) {
            completer.complete(
              const USSDResult(
                outcome: USSDStatus.pendingConfirmation,
                failureReason:
                    'No final network result was received after PIN entry. '
                    'Please verify the transaction before trying again.',
                sessionLog: [],
              ),
            );
          }
        });

        _progressController.add(
          const USSDProgress(
            status: USSDStatus.awaitingPIN,
            message:
                'Enter your Mobile Money PIN on the dialer screen to continue.',
          ),
        );
        break;
      case 'onResult':
        _prePinTimeout?.cancel();
        _prePinTimeout = null;
        _postPinTimeout?.cancel();
        _postPinTimeout = null;
        final args = call.arguments as Map;
        final outcome = args['outcome'] as String? ?? 'failure';
        final success = outcome == 'success';
        final completer = _resultCompleter;
        if (completer != null && !completer.isCompleted) {
          completer.complete(
            USSDResult(
              outcome: success ? USSDStatus.success : USSDStatus.failed,
              failureReason: success
                  ? null
                  : 'The network reported that the transaction failed.',
              sessionLog: const [],
            ),
          );
        }
        break;
    }
  }

  Future<bool> isServiceEnabled() async {
    final result = await _channel.invokeMethod<bool>('isServiceEnabled');
    return result ?? false;
  }

  Future<void> openAccessibilitySettings() async {
    await _channel.invokeMethod('openAccessibilitySettings');
  }

  /// Opens a provider's real USSD menu without starting the Accessibility
  /// automation service. Used for Free Personal transactions, where AgentPro
  /// may select the correct SIM but must not navigate the menu automatically.
  static Future<void> dialManual({
    required String dialCode,
    int? simSlot,
  }) async {
    final normalizedDialCode = dialCode.trim();
    if (normalizedDialCode.isEmpty) {
      throw ArgumentError.value(dialCode, 'dialCode', 'must not be empty');
    }

    await _channel.invokeMethod('dialManual', {
      'dial_code': normalizedDialCode,
      if (simSlot != null) 'sim_slot': simSlot,
    });
  }

  Future<void> cancelAutomation() async {
    _prePinTimeout?.cancel();
    _prePinTimeout = null;
    _postPinTimeout?.cancel();
    _postPinTimeout = null;

    try {
      await _channel.invokeMethod('cancelAutomation');
    } catch (_) {
      // Best-effort cleanup. The Flutter result still completes so the
      // processing screen never remains stuck indefinitely.
    }
  }

  /// Before the PIN prompt, a USSD session that produces no result must
  /// not leave the Processing screen running forever. Once the PIN prompt
  /// is reached, however, this timeout is cancelled because money may
  /// already move after manual authorization and the result is no longer
  /// safe to classify as a definite failure automatically.
  Future<USSDResult> execute({
    String? customerPhone,
    String? amount,
    required String transactionType,
    required String provider,
    String? operatorId,
    String? reference,
    String? merchantId,
    int? simSlot,
    String? dialCode,
    List<Map<String, dynamic>>? steps,
    List<String>? successMarkers,
    List<String>? failureMarkers,
    Map<String, String>? selections,
  }) async {
    _prePinTimeout?.cancel();
    _postPinTimeout?.cancel();
    _pinPromptReached = false;
    _resultCompleter = Completer<USSDResult>();

    _progressController.add(
      const USSDProgress(
        status: USSDStatus.dialing,
        message: 'Dialing network...',
      ),
    );

    _prePinTimeout = Timer(const Duration(seconds: 45), () async {
      final completer = _resultCompleter;

      if (_pinPromptReached || completer == null || completer.isCompleted) {
        return;
      }

      await cancelAutomation();

      if (!completer.isCompleted) {
        completer.complete(
          const USSDResult(
            outcome: USSDStatus.failed,
            failureReason:
                'No response received from the USSD session. Please check your network and try again.',
            sessionLog: [],
          ),
        );
      }
    });

    try {
      await _channel.invokeMethod('startAutomation', {
        if (customerPhone != null && customerPhone.isNotEmpty)
          'customer_phone': customerPhone,
        if (amount != null && amount.isNotEmpty) 'amount': amount,
        'transaction_type': transactionType,
        'provider': provider,
        if (operatorId != null) 'operator_id': operatorId,
        if (reference != null) 'reference': reference,
        if (merchantId != null) 'merchant_id': merchantId,
        if (simSlot != null) 'sim_slot': simSlot,
        if (dialCode != null) 'dial_code': dialCode,
        if (steps != null) 'steps': steps,
        if (successMarkers != null) 'success_markers': successMarkers,
        if (failureMarkers != null) 'failure_markers': failureMarkers,
        if (selections != null) 'selections': selections,
      });
    } on PlatformException catch (e) {
      _prePinTimeout?.cancel();
      _prePinTimeout = null;
      _postPinTimeout?.cancel();
      _postPinTimeout = null;
      await cancelAutomation();

      final failureReason = switch (e.code) {
        'SIM_REQUIRED' =>
          'A physical SIM must be selected before USSD automation can start.',
        'SIM_UNAVAILABLE' =>
          'AgentPro could not safely resolve the selected physical SIM. '
              'No USSD call was placed.',
        'PERMISSION_DENIED' =>
          'Phone permission is required before USSD automation can start.',
        'SERVICE_DISABLED' =>
          'AgentPro Accessibility Service is not enabled.',
        _ => 'USSD automation could not start (${e.code}).',
      };

      return USSDResult(
        outcome: USSDStatus.failed,
        failureReason: failureReason,
        sessionLog: const [],
      );
    } catch (_) {
      _prePinTimeout?.cancel();
      _prePinTimeout = null;
      _postPinTimeout?.cancel();
      _postPinTimeout = null;
      await cancelAutomation();

      return const USSDResult(
        outcome: USSDStatus.failed,
        failureReason: 'USSD automation could not start.',
        sessionLog: [],
      );
    }

    return _resultCompleter!.future;
  }

  void dispose() {
    _prePinTimeout?.cancel();
    _prePinTimeout = null;
    _postPinTimeout?.cancel();
    _postPinTimeout = null;
    if (!_progressController.isClosed) _progressController.close();
  }
}
