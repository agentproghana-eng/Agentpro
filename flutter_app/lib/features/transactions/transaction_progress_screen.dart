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
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/auth/auth_bloc.dart';

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
    final activeColor = highlightPIN
        ? AppTheme.secondaryColor
        : AppTheme.primaryColor;

    final circleColor = completed
        ? AppTheme.successColor
        : active
        ? activeColor
        : context.appSecondaryText.withOpacity(0.18);

    final textColor = pending
        ? context.appSecondaryText.withOpacity(0.68)
        : null;

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
    final transaction = widget.data['transaction'] as Map<String, dynamic>;
    final template = transaction['ussd_template'] as Map<String, dynamic>?;
    final automationParams = Map<String, String>.from(
      (transaction['automation_params'] as Map<String, dynamic>? ?? {}).map(
        (k, v) => MapEntry(k, v?.toString() ?? ''),
      ),
    );
    final provider = widget.data['provider'] as String;
    final transactionId = transaction['transaction_id'] as String;

    // USSD automation requires CALL_PHONE and READ_PHONE_STATE granted at
    // runtime (Android 6+) — request before touching SIM detection or dialing.
    // Bounded with a timeout - if the underlying permission_handler
    // plugin's native call itself hangs (seen on some device/OEM
    // combos even when the permission is genuinely already granted),
    // this turns a silent, indefinite stall into a clear, reportable
    // failure instead of leaving the screen frozen forever with no
    // way to tell whether it's still working or truly stuck.
    PermissionResult permissionResult;
    try {
      permissionResult = await PermissionService.requestTelephonyPermissions()
          .timeout(const Duration(seconds: 10));
    } on Exception {
      const reason = 'Timed out checking phone permissions. Please try again.';
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
    if (permissionResult != PermissionResult.granted) {
      final reason = permissionResult == PermissionResult.permanentlyDenied
          ? 'Phone permission was denied. Enable it in Settings to process transactions.'
          : 'Phone permission is required to process Mobile Money transactions.';
      if (mounted) {
        setState(() {
          _simWarning = reason;
          _permissionPermanentlyDenied =
              permissionResult == PermissionResult.permanentlyDenied;
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

    // Resolve which physical SIM slot carries this provider's network.
    // If the device has no SIM for the chosen provider, fail fast with a
    // clear message rather than dialing on the wrong network and burning
    // a confusing failed USSD session.
    if (mounted) setState(() => _statusMessage = 'Detecting SIM card...');
    int simSlot;
    try {
      final hasSim = await SimCardService.hasProviderSim(provider);
      if (!hasSim) {
        final reason =
            'No ${_providerLabel(provider)} SIM card was detected on this device.';
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
      simSlot = await SimCardService.getSlotForProvider(provider);
    } on SimPermissionException {
      // Belt-and-suspenders: we already requested permission above, but the
      // OS can still deny the actual platform call in edge cases (e.g. the
      // grant hasn't propagated yet). Treat the same as the upfront check.
      final reason = 'Phone permission is required to detect SIM cards.';
      if (mounted) {
        setState(() {
          _simWarning = reason;
          _permissionPermanentlyDenied = true;
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
    } catch (_) {
      // SIM detection failed for an unexpected reason — fall back to slot 0
      // rather than blocking the transaction entirely.
      simSlot = 0;
    }

    // MTN Cash In/Out and Telecel Deposit cannot use single-dial USSD -
    // confirmed via live testing that even a short concatenated dial
    // string fails immediately on both gateways. Route through the
    // Accessibility Service pilot instead. Telecel Cash Out ("Withdrawal")
    // is deliberately NOT included here - it's a manual-entry transaction
    // (money already moved peer-to-peer to the agent's SIM), never a
    // USSD dial at all.
    final transactionType = widget.data["transaction_type"] as String?;
    final bundleCategory = widget.data["bundle_category"] as String?;
    final recipientMode = widget.data["recipient_mode"] as String?;
    final selectionsInOrder =
        (widget.data["selections_in_order"] as List?)?.cast<String>() ??
        const [];
    final isMtnAccessibilityFlow =
        provider == "mtn" &&
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

    // Offline transactions carry their Flow Builder data pre-cached
    // (from the last successful online run), since /ussd-flows/resolve
    // itself needs connectivity and can't be called now. Use that
    // directly instead of hitting the network.
    final cachedFlow = transaction['cached_flow'] as Map<String, dynamic>?;
    if (cachedFlow != null) {
      final steps = (cachedFlow['steps'] as List).cast<Map<String, dynamic>>();
      final successMarkers = (cachedFlow['success_markers'] as List?)
          ?.cast<String>();
      final failureMarkers = (cachedFlow['failure_markers'] as List?)
          ?.cast<String>();
      final dialCode = cachedFlow['dial_code'] as String;

      final selectionsMap = <String, String>{};
      if (selectionsInOrder.isNotEmpty) {
        int selectionIndex = 0;
        for (int stepIndex = 0; stepIndex < steps.length; stepIndex++) {
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
        transactionType!,
        provider,
        telecelOperatorId,
        simSlot: simSlot,
        dialCode: dialCode,
        steps: steps,
        successMarkers: successMarkers,
        failureMarkers: failureMarkers,
        selections: selectionsMap.isEmpty ? null : selectionsMap,
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
      final flowData = resolveRes.data['data'] as Map<String, dynamic>;
      final steps = (flowData['steps'] as List).cast<Map<String, dynamic>>();
      final successMarkers = (flowData['success_markers'] as List?)
          ?.cast<String>();
      final failureMarkers = (flowData['failure_markers'] as List?)
          ?.cast<String>();
      final dialCode = flowData['dial_code'] as String;
      final selectionsMap = <String, String>{};
      if (selectionsInOrder.isNotEmpty) {
        int si = 0;
        for (int i = 0; i < steps.length; i++) {
          if (steps[i]['action'] == 'send_selection' &&
              si < selectionsInOrder.length) {
            selectionsMap[i.toString()] = selectionsInOrder[si];
            si++;
          }
        }
      }

      await _startAccessibilityAutomation(
        transactionId,
        automationParams,
        transactionType!,
        provider,
        telecelOperatorId,
        simSlot: simSlot,
        dialCode: dialCode,
        steps: steps,
        successMarkers: successMarkers,
        failureMarkers: failureMarkers,
        selections: selectionsMap.isEmpty ? null : selectionsMap,
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
      const reason =
          "Accessibility permission is required for automated "
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
    final transaction = widget.data["transaction"] as Map<String, dynamic>;
    final transactionId = transaction["transaction_id"] as String;
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
          _failureReason =
              result.failureReason ??
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

  Widget _buildResult() {
    final amount = widget.data['amount']?.toString() ?? '';
    final txType =
        widget.data['transaction_type']?.toString().replaceAll('_', ' ') ?? '';
    final customerPhone = widget.data['customer_phone']?.toString() ?? '';
    final receiptUrl = _completedTransaction?['receipt_url'];
    final isSuccess = _outcome == USSDStatus.success;
    final isPending = _outcome == USSDStatus.pendingConfirmation;

    final (icon, color) = switch (_outcome) {
      USSDStatus.success => (Icons.check_circle, AppTheme.successColor),
      USSDStatus.pendingConfirmation => (
        Icons.help_outline,
        AppTheme.warningColor,
      ),
      _ => (
        _simWarning != null ? Icons.sim_card_alert_outlined : Icons.cancel,
        AppTheme.errorColor,
      ),
    };

    final title = switch (_outcome) {
      USSDStatus.success => 'Transaction Successful!',
      USSDStatus.pendingConfirmation => 'Please Verify This Transaction',
      _ => _simWarning != null ? 'SIM Card Required' : 'Transaction Failed',
    };

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Result Icon
          Center(
            child: Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: color.withOpacity(0.1),
              ),
              child: Icon(icon, size: 60, color: color),
            ),
          ),
          const SizedBox(height: 24),

          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),

          const SizedBox(height: 8),

          if (isSuccess) ...[
            Text(
              'GH₵ $amount',
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              txType.toUpperCase(),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: context.appSecondaryText,
                letterSpacing: 1,
              ),
            ),
            if (customerPhone.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                customerPhone,
                textAlign: TextAlign.center,
                style: TextStyle(color: context.appSecondaryText),
              ),
            ],
            if (_wasManuallyConfirmed) ...[
              const SizedBox(height: 8),
              Text(
                'Confirmed manually by agent',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: context.appSecondaryText,
                  fontSize: 11,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
          ] else if (isPending) ...[
            Text(
              'GH₵ $amount · ${txType.toUpperCase()}',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: context.appSecondaryText,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.warningColor.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: AppTheme.warningColor.withOpacity(0.3),
                ),
              ),
              child: Text(
                _failureReason ??
                    'We could not confirm whether this transaction completed. '
                        'Please check your transaction history or ask the customer '
                        'before retrying — retrying a transaction that already '
                        'succeeded could result in a duplicate charge.',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 13),
              ),
            ),
          ] else ...[
            const SizedBox(height: 8),
            Text(
              _failureReason ?? 'The transaction could not be completed.',
              textAlign: TextAlign.center,
              style: TextStyle(color: context.appSecondaryText),
            ),
            if (_wasManuallyConfirmed) ...[
              const SizedBox(height: 8),
              Text(
                'Confirmed manually by agent',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: context.appSecondaryText,
                  fontSize: 11,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
          ],

          if (_completedTransaction?['reference'] != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.appSurface,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  _RefRow('Reference', _completedTransaction!['reference']),
                  if (_completedTransaction!['network_reference'] != null)
                    _RefRow(
                      'Network Ref',
                      _completedTransaction!['network_reference'],
                    ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 32),

          if (_permissionPermanentlyDenied) ...[
            AppButton(
              label: 'Open App Settings',
              icon: Icons.settings_outlined,
              onPressed: () => PermissionService.openSettings(),
            ),
            const SizedBox(height: 12),
          ],

          if (isSuccess && receiptUrl != null)
            AppButton(
              label: 'View Receipt',
              icon: Icons.receipt_long_outlined,
              onPressed: () {
                /* Open PDF */
              },
              outlined: true,
            ),

          if (isPending)
            AppButton(
              label: 'Check Transaction History',
              icon: Icons.history,
              onPressed: () => context.push(
                widget.isPersonal ? '/personal-home' : '/transactions',
              ),
              outlined: true,
            ),

          const SizedBox(height: 12),

          AppButton(
            label: 'New Transaction',
            icon: Icons.add,
            onPressed: () =>
                context.go(widget.isPersonal ? '/personal-home' : '/agent'),
          ),

          const SizedBox(height: 12),

          if (!widget.isPersonal)
            TextButton(
              onPressed: () =>
                  context.push('/transactions/${_completedTransaction?['id']}'),
              child: const Text('View Transaction Details'),
            ),
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
