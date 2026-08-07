import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../core/services/ussd_service.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/permission_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';
import '../../core/services/offline_queue_service.dart';
import '../../core/services/dashboard_refresh_service.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/auth/auth_bloc.dart';

class _USSDDevicePreparation {
  final int? simSlot;
  final String? failureReason;
  final bool permissionPermanentlyDenied;

  const _USSDDevicePreparation.ready(this.simSlot)
      : failureReason = null,
        permissionPermanentlyDenied = false;

  const _USSDDevicePreparation.failed(
    this.failureReason, {
    this.permissionPermanentlyDenied = false,
  }) : simSlot = null;

  bool get isReady => simSlot != null && failureReason == null;
}

class _ProgressTimelineItem {
  final String title;
  final String subtitle;
  final IconData icon;

  const _ProgressTimelineItem({
    required this.title,
    required this.subtitle,
    required this.icon,
  });
}

class _ProgressTimelineRow extends StatelessWidget {
  final _ProgressTimelineItem item;
  final bool completed;
  final bool active;
  final bool pending;
  final bool isLast;
  final bool highlightPIN;

  const _ProgressTimelineRow({
    required this.item,
    required this.completed,
    required this.active,
    required this.pending,
    required this.isLast,
    required this.highlightPIN,
  });

  @override
  Widget build(BuildContext context) {
    final activeColor =
        highlightPIN ? AppTheme.secondaryColor : AppTheme.primaryColor;

    final circleColor = completed
        ? AppTheme.successColor
        : active
            ? activeColor
            : context.appSecondaryText.withOpacity(0.18);

    final textColor =
        pending ? context.appSecondaryText.withOpacity(0.68) : null;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 38,
            child: Column(
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: circleColor,
                    shape: BoxShape.circle,
                    boxShadow: active
                        ? [
                            BoxShadow(
                              color: activeColor.withOpacity(0.25),
                              blurRadius: 8,
                            ),
                          ]
                        : null,
                  ),
                  child: Icon(
                    completed
                        ? Icons.check
                        : highlightPIN && active
                            ? Icons.lock_outline
                            : item.icon,
                    size: 16,
                    color: completed || active
                        ? Colors.white
                        : context.appSecondaryText,
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 3),
                      color: completed
                          ? AppTheme.successColor.withOpacity(0.55)
                          : context.appSecondaryText.withOpacity(0.14),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(top: 4, bottom: isLast ? 11 : 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                      color: active ? activeColor : textColor,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    completed
                        ? 'Completed'
                        : active
                            ? item.subtitle
                            : item.subtitle,
                    style: TextStyle(
                      fontSize: 10.5,
                      color: completed
                          ? AppTheme.successColor
                          : context.appSecondaryText,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class TransactionProgressScreen extends StatefulWidget {
  final Map<String, dynamic> data;
  // Personal transactions reuse this entire screen (USSD dialing, step
  // matching, native accessibility bridge are all identical) - this
  // flag only changes the small Agent-specific surface: which
  // "complete" endpoint gets called, and where the post-completion
  // buttons navigate (Personal doesn't have its own history/detail
  // screens yet, so those fall back to Personal Home for now).
  final bool isPersonal;
  const TransactionProgressScreen({
    super.key,
    required this.data,
    this.isPersonal = false,
  });

  @override
  State<TransactionProgressScreen> createState() =>
      _TransactionProgressScreenState();
}

class _TransactionProgressScreenState extends State<TransactionProgressScreen>
    with TickerProviderStateMixin {
  late AnimationController _pulseCtrl;
  USSDStatus _status = USSDStatus.idle;
  String _statusMessage = 'Checking permissions...';
  bool _completed = false;
  bool _wasManuallyConfirmed = false;
  bool _showConfirmButton = false;
  Timer? _confirmTimer;
  Map<String, dynamic>? _resolvedTransaction;
  USSDStatus _outcome = USSDStatus.failed;
  String? _failureReason;
  Map<String, dynamic>? _completedTransaction;
  USSDEngine? _engine;
  String? _simWarning;
  bool _permissionPermanentlyDenied = false;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    _startUSSD();
  }

  Future<void> _startUSSD() async {
    final provider = widget.data['provider'] as String;

    // Backend validation/creation and local device preparation begin
    // together. Dialing remains blocked until both have succeeded.
    final transactionFuture = _resolveTransactionData();
    final deviceFuture = _prepareUSSDDevice(provider);

    late Map<String, dynamic> transaction;
    late _USSDDevicePreparation devicePreparation;

    try {
      final results = await Future.wait<Object>([
        transactionFuture,
        deviceFuture,
      ]);

      transaction = results[0] as Map<String, dynamic>;
      _resolvedTransaction = transaction;
      devicePreparation = results[1] as _USSDDevicePreparation;
    } on DioException catch (error) {
      final responseData = error.response?.data;
      final message =
          responseData is Map ? responseData['message']?.toString() : null;

      _showStartupFailure(message ?? 'Failed to initiate transaction.');
      return;
    } on FormatException catch (error) {
      _showStartupFailure(error.message);
      return;
    } catch (_) {
      _showStartupFailure(
        'The transaction could not be started. Please try again.',
      );
      return;
    }

    final transactionId = transaction['transaction_id']?.toString();

    if (transactionId == null || transactionId.isEmpty) {
      _showStartupFailure('The server did not return a transaction ID.');
      return;
    }

    if (!devicePreparation.isReady) {
      final reason = devicePreparation.failureReason ??
          'The phone could not be prepared for USSD.';

      if (mounted) {
        setState(() {
          _simWarning = reason;
          _permissionPermanentlyDenied =
              devicePreparation.permissionPermanentlyDenied;
        });
      }

      await _reportResult(
        transactionId,
        USSDResult(
          outcome: USSDStatus.failed,
          failureReason: reason,
          sessionLog: const [],
        ),
      );
      return;
    }

    final simSlot = devicePreparation.simSlot!;
    final rawTemplate = transaction['ussd_template'];
    final template =
        rawTemplate is Map ? Map<String, dynamic>.from(rawTemplate) : null;

    final rawAutomationParams = transaction['automation_params'];

    final automationParams = Map<String, String>.from(
      (rawAutomationParams is Map
              ? Map<String, dynamic>.from(rawAutomationParams)
              : <String, dynamic>{})
          .map((key, value) => MapEntry(key, value?.toString() ?? '')),
    );

    // MTN Cash In/Out and Telecel Deposit cannot use single-dial USSD -
    // confirmed via live testing that even a short concatenated dial
    // string fails immediately on both gateways. Route through the
    // Accessibility Service pilot instead. Telecel Cash Out ("Withdrawal")
    // is deliberately NOT included here - it's a manual-entry transaction
    // (money already moved peer-to-peer to the agent's SIM), never a
    // USSD dial at all.
    final transactionType = widget.data["transaction_type"]?.toString() ??
        transaction["transaction_type"]?.toString();

    if (transactionType == null || transactionType.isEmpty) {
      _showStartupFailure("The transaction type is unavailable.");
      return;
    }

    final bundleCategory = widget.data["bundle_category"] as String?;
    final recipientMode = widget.data["recipient_mode"] as String?;
    final selectionsInOrder =
        (widget.data["selections_in_order"] as List?)?.cast<String>() ??
            const [];
    final isMtnAccessibilityFlow = provider == "mtn" &&
        (transactionType == "cash_in" ||
            transactionType == "cash_out" ||
            transactionType == "send_money");
    final isTelecelDepositFlow =
        provider == "telecel" && transactionType == "cash_in";

    // Telecel Operator ID is only actually needed by flows whose steps
    // include a send_operator_id action (Telecel Airtime, and the
    // hardcoded Deposit flow) - fetched here unconditionally so it's
    // available to pass along either way, but NOT blanket-required for
    // every Telecel transaction the way this used to work. That
    // blanket requirement blocked any other Telecel flow (e.g. Send
    // Money Same Network) for any account that never set this
    // Agent-only value, which a Personal account has no reason to have
    // done. The actual requirement is enforced natively in
    // UssdAccessibilityChannel.kt's needsOperatorId check, which knows
    // the resolved flow's real steps at the point it matters - this
    // layer doesn't need to duplicate that logic or guess in advance.
    String? telecelOperatorId;
    if (provider == "telecel") {
      final authState = context.read<AuthBloc>().state;
      telecelOperatorId = authState is AuthAuthenticated
          ? authState.user['telecel_operator_id'] as String?
          : null;
    }

    if (isMtnAccessibilityFlow || isTelecelDepositFlow) {
      await _startAccessibilityAutomation(
        transactionId,
        automationParams,
        transactionType!,
        provider,
        telecelOperatorId,
        simSlot: simSlot,
      );
      return;
    }

    if (mounted) setState(() => _statusMessage = 'Looking up automation...');

    // Use a supplied offline flow first, then the synchronously cached
    // Hive flow. This avoids waiting for another HTTP request during the
    // common transaction path. An online refresh runs in the background
    // so later transactions receive any server-side flow changes.
    final suppliedCachedFlow = transaction['cached_flow'];
    final cachedFlow = suppliedCachedFlow is Map
        ? Map<String, dynamic>.from(suppliedCachedFlow)
        : OfflineQueueService.getCachedFlow(provider, transactionType!);

    if (cachedFlow != null) {
      unawaited(
        _refreshCachedFlow(
          provider: provider,
          transactionType: transactionType,
          bundleCategory: bundleCategory,
          recipientMode: recipientMode,
        ),
      );

      await _startResolvedFlow(
        transactionId: transactionId,
        automationParams: Map<String, String>.from(automationParams),
        transactionType: transactionType!,
        provider: provider,
        telecelOperatorId: telecelOperatorId,
        simSlot: simSlot,
        flowData: cachedFlow,
        selectionsInOrder: selectionsInOrder,
      );
      return;
    }

    // Not MTN/Telecel's hardcoded flows - check whether a custom USSD
    // Flow Builder flow exists for this provider/transaction_type before
    // falling back to the single-dial USSDEngine below. Silently falls
    // through if none exists (404) or the lookup fails for any other
    // reason - most provider/type combos simply aren't customized, which
    // is the normal, expected case, not an error worth surfacing.
    try {
      final resolveRes = await ApiClient.instance.get(
        '/ussd-flows/resolve',
        queryParameters: {
          'provider': provider,
          'transaction_type': transactionType,
          if (bundleCategory != null) 'bundle_category': bundleCategory,
          if (recipientMode != null) 'recipient_mode': recipientMode,
        },
      );
      final rawFlowData = resolveRes.data['data'];
      if (rawFlowData is! Map) {
        throw const FormatException('Invalid USSD flow response');
      }

      final flowData = Map<String, dynamic>.from(rawFlowData);

      unawaited(
        OfflineQueueService.cacheFlow(provider, transactionType!, flowData),
      );

      await _startResolvedFlow(
        transactionId: transactionId,
        automationParams: Map<String, String>.from(automationParams),
        transactionType: transactionType!,
        provider: provider,
        telecelOperatorId: telecelOperatorId,
        simSlot: simSlot,
        flowData: flowData,
        selectionsInOrder: selectionsInOrder,
      );
      return;
    } on DioException catch (e) {
      // 404 just means no custom flow exists for this combo - fall
      // through to the single-dial path below, same as always. Any
      // other error also falls through rather than blocking the
      // transaction entirely on a lookup failure.
    } catch (_) {
      // Ignore and fall through to single-dial below.
    }

    // No cached flow, no online Flow Builder flow, and no legacy
    // single-dial template either - there is genuinely nothing to
    // automate with. Report a clear failure instead of force-unwrapping
    // template into a null-check crash, which used to fail silently
    // inside this async function with no error shown at all, leaving
    // the screen frozen on "Processing..." forever.
    if (template == null) {
      const reason =
          'No USSD automation is configured for this transaction type yet.';
      if (mounted) setState(() => _simWarning = reason);
      await _reportResult(
        transactionId,
        USSDResult(
          outcome: USSDStatus.failed,
          failureReason: reason,
          sessionLog: const [],
        ),
      );
      return;
    }

    final ussdTemplate = USSDTemplate.fromMap(template);
    _engine = USSDEngine(
      template: ussdTemplate,
      automationParams: automationParams,
      provider: provider,
      simSlot: simSlot,
    );

    // Listen to progress stream — the new engine only reports status +
    // message, no step counts, since there's no more multi-step loop
    // (see ussd_service.dart for why: a single dial replaces navigation).
    _engine!.progressStream.listen((progress) {
      if (mounted) {
        setState(() {
          _status = progress.status;
          _statusMessage = progress.message;
          _maybeStartConfirmTimer(progress.status);
        });
      }
    });

    // Execute USSD
    final result = await _engine!.execute();

    // Report result to backend
    await _reportResult(transactionId, result);
  }

  Future<Map<String, dynamic>> _resolveTransactionData() async {
    final existingTransaction = widget.data['transaction'];

    if (existingTransaction is Map) {
      return Map<String, dynamic>.from(existingTransaction);
    }

    final pendingTransaction = widget.data['transaction_future'];

    if (pendingTransaction is Future<Map<String, dynamic>>) {
      return pendingTransaction;
    }

    if (pendingTransaction is Future) {
      final resolved = await pendingTransaction;

      if (resolved is Map) {
        return Map<String, dynamic>.from(resolved);
      }
    }

    throw const FormatException('Missing transaction initiation data');
  }

  Future<_USSDDevicePreparation> _prepareUSSDDevice(String provider) async {
    if (mounted) {
      setState(() => _statusMessage = 'Checking phone permissions...');
    }

    PermissionResult permissionResult;

    try {
      permissionResult = await PermissionService.requestTelephonyPermissions()
          .timeout(const Duration(seconds: 10));
    } on Exception {
      return const _USSDDevicePreparation.failed(
        'Timed out checking phone permissions. Please try again.',
      );
    }

    if (permissionResult != PermissionResult.granted) {
      final permanentlyDenied =
          permissionResult == PermissionResult.permanentlyDenied;

      return _USSDDevicePreparation.failed(
        permanentlyDenied
            ? 'Phone permission was denied. Enable it in Settings to process transactions.'
            : 'Phone permission is required to process Mobile Money transactions.',
        permissionPermanentlyDenied: permanentlyDenied,
      );
    }

    if (mounted) {
      setState(() => _statusMessage = 'Detecting SIM card...');
    }

    try {
      final simCards = await SimCardService.getSimCards();

      for (final sim in simCards) {
        if (sim.network == provider) {
          return _USSDDevicePreparation.ready(sim.slot);
        }
      }

      return _USSDDevicePreparation.failed(
        'No ${_providerLabel(provider)} SIM card was detected on this device.',
      );
    } on SimPermissionException {
      return const _USSDDevicePreparation.failed(
        'Phone permission is required to detect SIM cards.',
        permissionPermanentlyDenied: true,
      );
    } catch (_) {
      // Preserve the existing fallback behavior for unexpected SIM
      // detection failures.
      return const _USSDDevicePreparation.ready(0);
    }
  }

  void _showStartupFailure(String message) {
    _pulseCtrl.stop();

    if (!mounted) return;

    setState(() {
      _status = USSDStatus.failed;
      _outcome = USSDStatus.failed;
      _failureReason = message;
      _statusMessage = message;
      _completed = true;
    });
  }

  Future<void> _startResolvedFlow({
    required String transactionId,
    required Map<String, String> automationParams,
    required String transactionType,
    required String provider,
    required String? telecelOperatorId,
    required int simSlot,
    required Map<String, dynamic> flowData,
    required List<String> selectionsInOrder,
  }) async {
    final rawSteps = flowData['steps'];
    final dialCode = flowData['dial_code'];

    if (rawSteps is! List ||
        rawSteps.isEmpty ||
        dialCode is! String ||
        dialCode.isEmpty) {
      throw const FormatException('Cached USSD flow is incomplete');
    }

    final steps =
        rawSteps.map((step) => Map<String, dynamic>.from(step as Map)).toList();

    final successMarkers = (flowData['success_markers'] as List?)
        ?.map((value) => value.toString())
        .toList();

    final failureMarkers = (flowData['failure_markers'] as List?)
        ?.map((value) => value.toString())
        .toList();

    final selectionsMap = <String, String>{};

    if (selectionsInOrder.isNotEmpty) {
      var selectionIndex = 0;

      for (var stepIndex = 0; stepIndex < steps.length; stepIndex++) {
        if (steps[stepIndex]['action'] == 'send_selection' &&
            selectionIndex < selectionsInOrder.length) {
          selectionsMap[stepIndex.toString()] =
              selectionsInOrder[selectionIndex];
          selectionIndex++;
        }
      }
    }

    await _startAccessibilityAutomation(
      transactionId,
      automationParams,
      transactionType,
      provider,
      telecelOperatorId,
      simSlot: simSlot,
      dialCode: dialCode,
      steps: steps,
      successMarkers: successMarkers,
      failureMarkers: failureMarkers,
      selections: selectionsMap.isEmpty ? null : selectionsMap,
    );
  }

  Future<void> _refreshCachedFlow({
    required String provider,
    required String transactionType,
    String? bundleCategory,
    String? recipientMode,
  }) async {
    try {
      final response = await ApiClient.instance.get(
        '/ussd-flows/resolve',
        queryParameters: {
          'provider': provider,
          'transaction_type': transactionType,
          if (bundleCategory != null) 'bundle_category': bundleCategory,
          if (recipientMode != null) 'recipient_mode': recipientMode,
        },
      );

      final rawFlowData = response.data['data'];
      if (rawFlowData is! Map) return;

      await OfflineQueueService.cacheFlow(
        provider,
        transactionType,
        Map<String, dynamic>.from(rawFlowData),
      );
    } catch (_) {
      // Refreshing future-use cache must never delay or interrupt
      // the active USSD transaction.
    }
  }

  Future<void> _startAccessibilityAutomation(
    String transactionId,
    Map<String, String> automationParams,
    String transactionType,
    String provider,
    String? operatorId, {
    required int simSlot,
    String? dialCode,
    List<Map<String, dynamic>>? steps,
    List<String>? successMarkers,
    List<String>? failureMarkers,
    Map<String, String>? selections,
  }) async {
    // MTN Send Money uses the exact same Cash In USSD menu action as
    // Cash In itself (confirmed via live device testing - same menu
    // digit "3", same prompts, same receipt wording). The native layer
    // only knows cash_in/cash_out branches, so translate at this
    // boundary rather than teaching Kotlin a third transaction type it
    // would handle identically anyway. The one real difference is WHICH
    // phone number gets credited - the recipient's, not the customer's.
    final nativeTransactionType =
        (provider == "mtn" && transactionType == "send_money")
            ? "cash_in"
            : transactionType;
    final phoneForAutomation = (transactionType == "send_money")
        ? (automationParams["recipient_phone"] ?? "")
        : (automationParams["customer_phone"] ?? "");

    final accessEngine = UssdAccessibilityEngine();

    final enabled = await accessEngine.isServiceEnabled();
    if (!enabled) {
      const reason = "Accessibility permission is required for automated "
          "USSD transactions. Enable Agent Pro Ghana under Settings > "
          "Accessibility, then try again.";
      if (mounted) setState(() => _simWarning = reason);
      await accessEngine.openAccessibilitySettings();
      await _reportResult(
        transactionId,
        USSDResult(
          outcome: USSDStatus.failed,
          failureReason: reason,
          sessionLog: const [],
        ),
      );
      return;
    }

    accessEngine.progressStream.listen((progress) {
      if (mounted) {
        setState(() {
          _status = progress.status;
          _statusMessage = progress.message;
          _maybeStartConfirmTimer(progress.status);
        });
      }
    });

    final result = await accessEngine.execute(
      customerPhone: phoneForAutomation,
      amount: automationParams["amount"] ?? "",
      transactionType: nativeTransactionType,
      provider: provider,
      operatorId: operatorId,
      reference: automationParams["payment_reference"],
      merchantId: automationParams["merchant_id"],
      simSlot: simSlot,
      dialCode: dialCode,
      steps: steps,
      successMarkers: successMarkers,
      failureMarkers: failureMarkers,
    );

    accessEngine.dispose();
    await _reportResult(transactionId, result);
  }

  String _providerLabel(String provider) => switch (provider) {
        'mtn' => 'MTN',
        'telecel' => 'Telecel',
        'at_money' => 'AT Money',
        _ => provider.toUpperCase(),
      };

  void _maybeStartConfirmTimer(USSDStatus status) {
    if (status != USSDStatus.awaitingPIN || _confirmTimer != null) return;
    _confirmTimer = Timer(const Duration(seconds: 10), () {
      if (mounted && !_completed) setState(() => _showConfirmButton = true);
    });
  }

  // Manual fallback for when the automation genuinely cannot tell
  // whether a transaction succeeded (e.g. an OEM-branded confirmation
  // dialog the accessibility service fails to read). Never guesses on
  // the app's own behalf - the agent must state what they actually
  // saw on the real network screen.
  Future<void> _confirmManually() async {
    final outcome = await showDialog<USSDStatus>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Did the transaction succeed?"),
        content: const Text(
          "Check the result shown on your network screen, then choose what it said.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, USSDStatus.failed),
            child: const Text("It failed"),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, USSDStatus.success),
            child: const Text("It succeeded"),
          ),
        ],
      ),
    );
    if (outcome == null) return;
    _wasManuallyConfirmed = true;

    final transaction = _resolvedTransaction ??
        (widget.data["transaction"] is Map
            ? Map<String, dynamic>.from(widget.data["transaction"] as Map)
            : null);

    final transactionId = transaction?["transaction_id"]?.toString();

    if (transactionId == null || transactionId.isEmpty) {
      _showStartupFailure("The transaction reference is unavailable.");
      return;
    }

    await _reportResult(
      transactionId,
      USSDResult(
        outcome: outcome,
        failureReason: outcome == USSDStatus.failed
            ? "Manually confirmed as failed by agent"
            : null,
        sessionLog: const [],
      ),
    );
  }

  Future<void> _reportResult(String transactionId, USSDResult result) async {
    // Map the engine's outcome to the backend's status values directly —
    // do NOT collapse pendingConfirmation into 'failed'. That distinction
    // is the entire point of this status: we genuinely don't know if the
    // transaction succeeded, and telling the agent it definitely failed
    // could cause them to retry a transaction that already went through.
    final statusString = switch (result.outcome) {
      USSDStatus.success => 'success',
      USSDStatus.pendingConfirmation => 'pending_confirmation',
      _ => 'failed',
    };

    // Offline transaction: this local ID means the dial already
    // happened but the app has no connectivity to report it. Queue it
    // for sync instead of calling the real API, which would just fail.
    if (transactionId.startsWith("local_")) {
      final requestFields = Map<String, dynamic>.from(
        widget.data["request_fields"] as Map,
      );
      await OfflineQueueService.queueTransaction(
        requestFields: requestFields,
        status: statusString,
        networkReference: result.networkReference,
        failureReason: result.failureReason,
        sessionLog: result.sessionLog,
      );
      if (mounted) {
        setState(() {
          _completed = true;
          _outcome = result.outcome;
          _failureReason = result.failureReason;
          _completedTransaction = {
            "reference": transactionId,
            "status": statusString,
            "offline_pending_sync": true,
          };
        });
      }
      return;
    }

    try {
      final res = await ApiClient.instance.patch(
        '${widget.isPersonal ? '/personal-transactions' : '/transactions'}/$transactionId/complete',
        data: {
          'status': statusString,
          'network_reference': result.networkReference,
          'failure_reason': result.failureReason,
          'ussd_session_log': result.sessionLog,
        },
      );

      if (mounted) {
        setState(() {
          _completed = true;
          _outcome = result.outcome;
          _failureReason = result.failureReason;
          _completedTransaction = res.data['data'];
        });
      }
    } on DioException catch (e) {
      // e.response == null means the request never reached the server
      // (dropped connectivity, timeout) - genuinely retryable, so queue
      // it rather than showing a dead-end failure. e.response != null
      // means the server responded with a real error (validation,
      // auth, etc.) - retrying would just fail again, so keep showing
      // that as before.
      if (e.response == null) {
        await OfflineQueueService.queuePendingCompletion(
          transactionId: transactionId,
          status: statusString,
          networkReference: result.networkReference,
          failureReason: result.failureReason,
          sessionLog: result.sessionLog,
        );
        if (mounted) {
          setState(() {
            _completed = true;
            _outcome = result.outcome;
            _failureReason = result.failureReason;
            _completedTransaction = {
              "reference": transactionId,
              "status": statusString,
              "offline_pending_sync": true,
            };
          });
        }
        return;
      }
      if (mounted) {
        setState(() {
          _completed = true;
          _outcome = result.outcome;
          _failureReason = result.failureReason ??
              (e.response?.data?['message'] as String? ??
                  'Could not sync with server');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _completed,
      child: Scaffold(
        backgroundColor: context.appScaffoldBg,
        appBar: AppBar(
          title: const Text('Processing Transaction'),
          automaticallyImplyLeading: _completed,
        ),
        body: _completed ? _buildResult() : _buildProgress(),
      ),
    );
  }

  int get _activeProgressStep {
    if (_status == USSDStatus.awaitingPIN) return 4;

    final message = _statusMessage.toLowerCase();

    if (message.contains('permission')) return 0;
    if (message.contains('sim')) return 1;
    if (message.contains('flow') ||
        message.contains('automation') ||
        message.contains('looking up')) {
      return 2;
    }

    if (_status == USSDStatus.dialing ||
        message.contains('dial') ||
        message.contains('opening')) {
      return 3;
    }

    if (_status == USSDStatus.processing) return 3;

    return 0;
  }

  List<_ProgressTimelineItem> get _progressItems => const [
        _ProgressTimelineItem(
          title: 'Preparing transaction',
          subtitle: 'Checking permissions and transaction details',
          icon: Icons.verified_user_outlined,
        ),
        _ProgressTimelineItem(
          title: 'Detecting network SIM',
          subtitle: 'Selecting the correct SIM card',
          icon: Icons.sim_card_outlined,
        ),
        _ProgressTimelineItem(
          title: 'Loading automation',
          subtitle: 'Preparing the provider USSD flow',
          icon: Icons.account_tree_outlined,
        ),
        _ProgressTimelineItem(
          title: 'Running USSD',
          subtitle: 'Navigating the network menu securely',
          icon: Icons.dialpad_outlined,
        ),
        _ProgressTimelineItem(
          title: 'Waiting for PIN',
          subtitle: 'Manual authorization on the network screen',
          icon: Icons.lock_outline,
        ),
        _ProgressTimelineItem(
          title: 'Confirming result',
          subtitle: 'Waiting for the provider response',
          icon: Icons.receipt_long_outlined,
        ),
      ];

  Widget _buildProgress() {
    final isAwaitingPIN = _status == USSDStatus.awaitingPIN;
    final activeStep = _activeProgressStep;
    final provider = widget.data['provider']?.toString() ?? '';
    final type =
        widget.data['transaction_type']?.toString().replaceAll('_', ' ') ?? '';

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: isAwaitingPIN
                    ? [
                        AppTheme.secondaryColor.withOpacity(0.18),
                        AppTheme.secondaryColor.withOpacity(0.06),
                      ]
                    : [
                        AppTheme.primaryColor.withOpacity(0.16),
                        AppTheme.primaryColor.withOpacity(0.05),
                      ],
              ),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: isAwaitingPIN
                    ? AppTheme.secondaryColor.withOpacity(0.35)
                    : AppTheme.primaryColor.withOpacity(0.25),
              ),
            ),
            child: Row(
              children: [
                AnimatedBuilder(
                  animation: _pulseCtrl,
                  builder: (_, __) => Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isAwaitingPIN
                          ? AppTheme.secondaryColor.withOpacity(
                              0.12 + (_pulseCtrl.value * 0.13),
                            )
                          : AppTheme.primaryColor.withOpacity(
                              0.10 + (_pulseCtrl.value * 0.12),
                            ),
                    ),
                    child: Icon(
                      isAwaitingPIN ? Icons.lock_outline : Icons.sync_rounded,
                      size: 30,
                      color: isAwaitingPIN
                          ? AppTheme.secondaryColor
                          : AppTheme.primaryColor,
                    ),
                  ),
                ),
                const SizedBox(width: 15),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 250),
                        child: Text(
                          isAwaitingPIN
                              ? 'Waiting for your PIN'
                              : 'Transaction in progress',
                          key: ValueKey(isAwaitingPIN),
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        '${_providerLabel(provider)} · '
                        '${type.isEmpty ? 'Mobile Money transaction' : type}',
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: context.appSecondaryText,
                        ),
                      ),
                      const SizedBox(height: 7),
                      Text(
                        _statusMessage,
                        style: TextStyle(
                          fontSize: 12,
                          color: context.appSecondaryText,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          const Text(
            'Transaction progress',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.fromLTRB(15, 16, 15, 8),
            decoration: BoxDecoration(
              color: context.appSurface,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              children: List.generate(_progressItems.length, (index) {
                final item = _progressItems[index];
                final completed = index < activeStep;
                final active = index == activeStep;
                final pending = index > activeStep;

                return _ProgressTimelineRow(
                  item: item,
                  completed: completed,
                  active: active,
                  pending: pending,
                  isLast: index == _progressItems.length - 1,
                  highlightPIN: index == 4 && isAwaitingPIN,
                );
              }),
            ),
          ),
          if (isAwaitingPIN) ...[
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: context.isDarkMode
                    ? const Color(0xFF302A18)
                    : const Color(0xFFFFF7DA),
                borderRadius: BorderRadius.circular(15),
                border: Border.all(
                  color: AppTheme.secondaryColor.withOpacity(0.55),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.shield_outlined,
                        color: AppTheme.secondaryColor,
                      ),
                      const SizedBox(width: 9),
                      const Expanded(
                        child: Text(
                          'Your PIN stays private',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 9),
                  Text(
                    'Enter your PIN only on the network USSD screen. '
                    'AgentPro never reads, stores, or enters your PIN.',
                    style: TextStyle(
                      fontSize: 12.5,
                      height: 1.45,
                      color: context.appSecondaryText,
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Row(
                    children: [
                      Icon(
                        Icons.touch_app_outlined,
                        size: 17,
                        color: AppTheme.secondaryColor,
                      ),
                      SizedBox(width: 7),
                      Expanded(
                        child: Text(
                          'After entering the PIN, keep this screen open '
                          'while the network completes the transaction.',
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
          if (_showConfirmButton) ...[
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: context.isDarkMode
                    ? const Color(0xFF172943)
                    : const Color(0xFFEAF3FF),
                borderRadius: BorderRadius.circular(15),
                border: Border.all(
                  color: const Color(0xFF6FA5E6).withOpacity(0.55),
                ),
              ),
              child: Column(
                children: [
                  Text(
                    'No final response has returned from the network yet. '
                    'Confirm only after checking the result shown on your phone.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12.5,
                      color: context.appSecondaryText,
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _confirmManually,
                      icon: const Icon(Icons.fact_check_outlined),
                      label: const Text('Confirm Transaction Result'),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                width: 17,
                height: 17,
                child: CircularProgressIndicator(
                  strokeWidth: 2.4,
                  color: isAwaitingPIN
                      ? AppTheme.secondaryColor
                      : AppTheme.primaryColor,
                ),
              ),
              const SizedBox(width: 9),
              Text(
                'Keep AgentPro open until this finishes',
                style: TextStyle(
                  color: context.appSecondaryText,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _resultTitleCase(String value) {
    return value
        .replaceAll('_', ' ')
        .split(' ')
        .where((part) => part.isNotEmpty)
        .map(
          (part) =>
              '${part[0].toUpperCase()}${part.substring(1).toLowerCase()}',
        )
        .join(' ');
  }

  String _resultTimeLabel() {
    final now = DateTime.now();
    final hour = now.hour == 0
        ? 12
        : now.hour > 12
            ? now.hour - 12
            : now.hour;
    final minute = now.minute.toString().padLeft(2, '0');
    final period = now.hour >= 12 ? 'PM' : 'AM';

    return '${now.day.toString().padLeft(2, '0')}/'
        '${now.month.toString().padLeft(2, '0')}/${now.year} · '
        '$hour:$minute $period';
  }

  Widget _resultDetailRow({
    required IconData icon,
    required String label,
    required String value,
    Color? valueColor,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: AppTheme.primaryColor.withOpacity(0.09),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(icon, size: 18, color: AppTheme.primaryColor),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: context.appSecondaryText,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                SelectableText(
                  value,
                  style: TextStyle(
                    color: valueColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _resultNotice({
    required IconData icon,
    required String title,
    required String message,
    required Color color,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: color.withOpacity(context.isDarkMode ? 0.13 : 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(0.32)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 21),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: TextStyle(
              height: 1.45,
              fontSize: 12,
              color: context.appSecondaryText,
            ),
          ),
        ],
      ),
    );
  }

  void _returnHome({required bool refreshDashboard}) {
    if (refreshDashboard) {
      DashboardRefreshService.notifyTransactionCompleted(
        isPersonal: widget.isPersonal,
        provider: widget.data['provider']?.toString() ?? 'mtn',
      );
    }

    context.go(widget.isPersonal ? '/personal-home' : '/agent');
  }

  void _retryTransaction() {
    final provider = widget.data['provider']?.toString() ?? 'mtn';
    final type = widget.data['transaction_type']?.toString() ?? '';

    if (widget.isPersonal) {
      context.go(
        Uri(
          path: '/personal-transactions/new',
          queryParameters: {'type': type, 'provider': provider},
        ).toString(),
      );
      return;
    }

    context.go('/transactions?type=$type&provider=$provider');
  }

  Widget _buildResult() {
    final rawAmount = widget.data['amount']?.toString() ?? '';
    final parsedAmount =
        double.tryParse(rawAmount.replaceAll(',', '').trim()) ?? 0;
    final showAmount = parsedAmount > 0;

    final rawType = widget.data['transaction_type']?.toString() ?? '';
    final transactionType = _resultTitleCase(rawType);
    final provider = widget.data['provider']?.toString() ?? '';
    final providerLabel = _providerLabel(provider);
    final customerPhone =
        widget.data['customer_phone']?.toString().trim() ?? '';

    final reference = _completedTransaction?['reference']?.toString() ?? '';
    final networkReference =
        _completedTransaction?['network_reference']?.toString() ?? '';
    final isOfflinePending =
        _completedTransaction?['offline_pending_sync'] == true;
    final transactionId = _completedTransaction?['id']?.toString();

    final isSuccess = _outcome == USSDStatus.success;
    final isPending = _outcome == USSDStatus.pendingConfirmation;

    final Color statusColor;
    final IconData statusIcon;
    final String title;
    final String subtitle;

    if (isSuccess) {
      statusColor = AppTheme.successColor;
      statusIcon = Icons.check_circle_rounded;
      title = 'Transaction Successful';
      subtitle = 'The transaction was completed successfully.';
    } else if (isPending) {
      statusColor = AppTheme.warningColor;
      statusIcon = Icons.help_rounded;
      title = 'Result Needs Verification';
      subtitle = 'The network did not return a final confirmation.';
    } else if (_simWarning != null) {
      statusColor = AppTheme.errorColor;
      statusIcon = Icons.sim_card_alert_outlined;
      title = 'SIM Card Required';
      subtitle = 'The transaction could not be started.';
    } else {
      statusColor = AppTheme.errorColor;
      statusIcon = Icons.cancel_rounded;
      title = 'Transaction Failed';
      subtitle = 'The transaction was not completed.';
    }

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(18, 24, 18, 20),
            decoration: BoxDecoration(
              color: context.appSurface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: statusColor.withOpacity(0.22)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.06),
                  blurRadius: 14,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
            child: Column(
              children: [
                Container(
                  width: 88,
                  height: 88,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: statusColor.withOpacity(0.11),
                  ),
                  child: Icon(statusIcon, size: 52, color: statusColor),
                ),
                const SizedBox(height: 17),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 21,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: context.appSecondaryText,
                    fontSize: 12,
                  ),
                ),
                if (showAmount) ...[
                  const SizedBox(height: 18),
                  Text(
                    'GH₵ ${parsedAmount.toStringAsFixed(2)}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.09),
                    borderRadius: BorderRadius.circular(30),
                  ),
                  child: Text(
                    transactionType.isEmpty
                        ? 'Mobile Money Transaction'
                        : transactionType,
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 6),
            decoration: BoxDecoration(
              color: context.appSurface,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                _resultDetailRow(
                  icon: Icons.cell_tower_outlined,
                  label: 'Provider',
                  value: providerLabel,
                ),
                const Divider(height: 1),
                _resultDetailRow(
                  icon: Icons.swap_horiz_rounded,
                  label: 'Transaction Type',
                  value: transactionType.isEmpty
                      ? 'Mobile Money Transaction'
                      : transactionType,
                ),
                if (customerPhone.isNotEmpty) ...[
                  const Divider(height: 1),
                  _resultDetailRow(
                    icon: Icons.phone_outlined,
                    label: rawType == 'business_deposit' ||
                            rawType == 'business_withdrawal'
                        ? 'Agent Short Code'
                        : 'Customer Number',
                    value: customerPhone,
                  ),
                ],
                if (reference.isNotEmpty) ...[
                  const Divider(height: 1),
                  _resultDetailRow(
                    icon: Icons.tag,
                    label: 'AgentPro Reference',
                    value: reference,
                  ),
                ],
                if (networkReference.isNotEmpty) ...[
                  const Divider(height: 1),
                  _resultDetailRow(
                    icon: Icons.confirmation_number_outlined,
                    label: 'Network Reference',
                    value: networkReference,
                  ),
                ],
                const Divider(height: 1),
                _resultDetailRow(
                  icon: Icons.schedule_outlined,
                  label: 'Completed',
                  value: _resultTimeLabel(),
                ),
              ],
            ),
          ),
          if (_wasManuallyConfirmed) ...[
            const SizedBox(height: 14),
            _resultNotice(
              icon: Icons.fact_check_outlined,
              title: 'Manually confirmed',
              message: 'This result was confirmed manually after checking '
                  'the network response.',
              color: AppTheme.warningColor,
            ),
          ],
          if (isOfflinePending) ...[
            const SizedBox(height: 14),
            _resultNotice(
              icon: Icons.cloud_upload_outlined,
              title: 'Waiting to sync',
              message: 'The transaction result is saved safely on this device '
                  'and will sync when internet access returns.',
              color: AppTheme.primaryColor,
            ),
          ],
          if (isPending) ...[
            const SizedBox(height: 14),
            _resultNotice(
              icon: Icons.warning_amber_rounded,
              title: 'Check before retrying',
              message: _failureReason ??
                  'Check the network message, customer balance, or '
                      'transaction history before trying again. A retry '
                      'could duplicate a transaction that already succeeded.',
              color: AppTheme.warningColor,
            ),
          ] else if (!isSuccess) ...[
            const SizedBox(height: 14),
            _resultNotice(
              icon: Icons.info_outline,
              title: 'What happened',
              message:
                  _failureReason ?? 'The transaction could not be completed.',
              color: AppTheme.errorColor,
            ),
          ],
          const SizedBox(height: 22),
          if (_permissionPermanentlyDenied) ...[
            AppButton(
              label: 'Open App Settings',
              icon: Icons.settings_outlined,
              onPressed: PermissionService.openSettings,
            ),
            const SizedBox(height: 12),
          ],
          if (isSuccess) ...[
            AppButton(
              label: 'New Transaction',
              icon: Icons.add_circle_outline,
              onPressed: () => _returnHome(refreshDashboard: true),
            ),
            const SizedBox(height: 12),
            AppButton(
              label: 'Done',
              icon: Icons.home_outlined,
              onPressed: () => _returnHome(refreshDashboard: true),
              outlined: true,
            ),
          ] else if (isPending) ...[
            AppButton(
              label: 'Check Transaction History',
              icon: Icons.history,
              onPressed: () => context.go(
                widget.isPersonal ? '/personal-home' : '/transactions',
              ),
            ),
            const SizedBox(height: 12),
            AppButton(
              label: 'Go Home',
              icon: Icons.home_outlined,
              onPressed: () => _returnHome(refreshDashboard: true),
              outlined: true,
            ),
          ] else ...[
            AppButton(
              label: 'Try Again',
              icon: Icons.refresh_rounded,
              onPressed: _retryTransaction,
            ),
            const SizedBox(height: 12),
            AppButton(
              label: 'Go Home',
              icon: Icons.home_outlined,
              onPressed: () => _returnHome(refreshDashboard: false),
              outlined: true,
            ),
          ],
          if (!widget.isPersonal &&
              transactionId != null &&
              transactionId.isNotEmpty) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: () => context.push('/transactions/$transactionId'),
              icon: const Icon(Icons.open_in_new, size: 17),
              label: const Text('View Transaction Details'),
            ),
          ],
        ],
      ),
    );
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    _confirmTimer?.cancel();
    _engine?.dispose();
    super.dispose();
  }
}

class _RefRow extends StatelessWidget {
  final String label, value;
  const _RefRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Text(
            label,
            style: TextStyle(color: context.appSecondaryText, fontSize: 12),
          ),
          const Spacer(),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
