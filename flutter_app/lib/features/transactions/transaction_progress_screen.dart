import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../core/services/ussd_service.dart';
import '../../core/services/transaction_device_preparation_service.dart';
import '../../core/services/permission_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';
import '../../shared/utils/transaction_labels.dart';
import '../../shared/widgets/ussd_accessibility_disclosure.dart';
import '../../core/services/offline_queue_service.dart';
import '../../core/services/sim_role_assignment_service.dart';
import '../../core/services/dashboard_refresh_service.dart';
import '../../core/services/storage_service.dart';
import '../ussd_flows/ussd_flow_runtime_policy.dart';
import '../ussd_flows/ussd_flow_draft_validation.dart';
import 'transaction_reference_display.dart';
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
    final activeColor =
        highlightPIN ? AppTheme.secondaryColor : AppTheme.primaryColor;

    final circleColor = completed
        ? AppTheme.successColor
        : active
            ? activeColor
            : context.appSecondaryText.withValues(alpha: 0.18);

    final textColor =
        pending ? context.appSecondaryText.withValues(alpha: 0.68) : null;

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
                              color: activeColor.withValues(alpha: 0.25),
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
                          ? AppTheme.successColor.withValues(alpha: 0.55)
                          : context.appSecondaryText.withValues(alpha: 0.14),
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
    with TickerProviderStateMixin, WidgetsBindingObserver {
  late AnimationController _pulseCtrl;
  USSDStatus _status = USSDStatus.idle;
  String _statusMessage = 'Checking permissions...';
  bool _completed = false;
  bool _wasManuallyConfirmed = false;

  StreamSubscription? _engineProgressSubscription;
  StreamSubscription? _accessibilityProgressSubscription;

  Map<String, dynamic>? _resolvedTransaction;
  USSDStatus _outcome = USSDStatus.failed;
  String? _failureReason;
  Map<String, dynamic>? _completedTransaction;
  DateTime? _resultRecordedAt;
  USSDEngine? _engine;
  String? _simWarning;
  bool _permissionPermanentlyDenied = false;
  bool _startupInitiationRetryAvailable = false;
  late final OfflineQueueIdentity? _offlineIdentity;

  // Free Personal transactions open the network-owned USSD screen without
  // Accessibility automation. ACTION_CALL returns to Flutter immediately,
  // so completion must wait for a real app background -> resume cycle before
  // asking the user what the network reported.
  Completer<void>? _manualDialResumeCompleter;
  bool _manualDialSawBackground = false;
  Completer<void>? _settingsResumeCompleter;
  bool _settingsSawBackground = false;

  @override
  void initState() {
    super.initState();

    final authState = context.read<AuthBloc>().state;
    _offlineIdentity = authState is AuthAuthenticated
        ? OfflineQueueService.identityFromUser(authState.user)
        : null;

    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    WidgetsBinding.instance.addObserver(this);
    _startUSSD();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      if (_manualDialResumeCompleter != null) {
        _manualDialSawBackground = true;
      }

      if (_settingsResumeCompleter != null) {
        _settingsSawBackground = true;
      }

      return;
    }

    if (state != AppLifecycleState.resumed) {
      return;
    }

    final manualCompleter = _manualDialResumeCompleter;

    if (manualCompleter != null && _manualDialSawBackground) {
      _manualDialResumeCompleter = null;
      _manualDialSawBackground = false;

      if (!manualCompleter.isCompleted) {
        manualCompleter.complete();
      }
    }

    final settingsCompleter = _settingsResumeCompleter;

    if (settingsCompleter != null && _settingsSawBackground) {
      _settingsResumeCompleter = null;
      _settingsSawBackground = false;

      if (!settingsCompleter.isCompleted) {
        settingsCompleter.complete();
      }
    }
  }

  Future<void> _startUSSD() async {
    final provider = widget.data['provider'] as String;

    if (_offlineIdentity == null) {
      _showStartupFailure(
        'Your authenticated account identity is unavailable. Sign in again before starting this transaction.',
      );
      return;
    }

    final suppliedTransaction = widget.data['transaction'];

    final suppliedTransactionId = suppliedTransaction is Map
        ? suppliedTransaction['transaction_id']?.toString().trim()
        : null;

    if (suppliedTransactionId != null &&
        suppliedTransactionId.startsWith('local_')) {
      final trust = await StorageService.evaluateOfflineTransactionTrust(
        isPersonal: widget.isPersonal,
      );

      if (!trust.isValid) {
        _showStartupFailure(
          'Offline transaction access needs a fresh server '
          'verification. Connect to the internet, open AgentPro, '
          'then try again.',
        );
        return;
      }
    }

    // Backend validation/creation and local device preparation begin
    // together. Dialing remains blocked until both have succeeded.
    final requestedSimSlot = _parseSimSlot(widget.data['sim_slot']);
    final requestedSimIccid = widget.data['sim_iccid']?.toString();
    final requestedSimSubscriptionId = int.tryParse(
      widget.data['sim_subscription_id']?.toString() ?? '',
    );

    String? expectedBusinessRole;

    if (widget.isPersonal == false) {
      final suppliedRole =
          widget.data['sim_role']?.toString().trim().toLowerCase();

      final suppliedRoleIsValid = suppliedRole == 'agent' ||
          suppliedRole == 'evd' ||
          suppliedRole == 'merchant';

      if (suppliedRoleIsValid) {
        expectedBusinessRole = suppliedRole;
      } else if (requestedSimSlot == null) {
        // Compatibility for an older Business navigation payload
        // which did not carry either a role or physical SIM slot.
        expectedBusinessRole = 'agent';
      } else {
        try {
          expectedBusinessRole =
              await SimRoleAssignmentService.businessRoleForSlot(
            requestedSimSlot,
            refreshFromServer: true,
            allowLegacyAgentFallback: false,
            simIccid: requestedSimIccid,
            simSubscriptionId: requestedSimSubscriptionId,
            provider: provider,
          );
        } on StateError catch (error) {
          _showStartupFailure(error.message);
          return;
        }
      }
    }

    final transactionFuture = _resolveTransactionData();
    final deviceFuture = TransactionDevicePreparationService.prepare(
      provider: provider,
      requestedSimSlot: requestedSimSlot,
      requestedSimIccid: requestedSimIccid,
      requestedSimSubscriptionId: requestedSimSubscriptionId,
      onStatus: (message) {
        if (mounted) {
          setState(() => _statusMessage = message);
        }
      },
    );

    late Map<String, dynamic> transaction;
    late TransactionDevicePreparation devicePreparation;

    try {
      final results = await Future.wait<Object>([
        transactionFuture,
        deviceFuture,
      ]);

      transaction = results[0] as Map<String, dynamic>;
      _resolvedTransaction = transaction;
      devicePreparation = results[1] as TransactionDevicePreparation;
    } on DioException catch (error) {
      final responseData = error.response?.data;
      final message =
          responseData is Map ? responseData['message']?.toString() : null;

      _startupInitiationRetryAvailable = !widget.isPersonal &&
          widget.data['request_fields'] is Map &&
          _isRetryableInitiationError(error);

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

    if (widget.isPersonal == false) {
      String actualBusinessRole;

      try {
        actualBusinessRole = await SimRoleAssignmentService.businessRoleForSlot(
          simSlot,
          refreshFromServer: false,
          allowLegacyAgentFallback: false,
          simIccid: devicePreparation.simIccid,
          simSubscriptionId: devicePreparation.simSubscriptionId,
          provider: provider,
        );
      } on StateError catch (error) {
        final reason = error.message;

        if (mounted) {
          setState(() => _simWarning = reason);
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

      if (actualBusinessRole == expectedBusinessRole) {
        // The role used for automation resolution still belongs
        // to the physical SIM Android prepared.
      } else {
        final reason =
            'The prepared SIM does not match the selected Business role. '
            'Expected ${expectedBusinessRole ?? 'Business'}, '
            'but found $actualBusinessRole. '
            'Select the correct SIM and try again.';

        if (mounted) {
          setState(() => _simWarning = reason);
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
    }
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
    final transactionType = widget.data['transaction_type']?.toString() ??
        transaction['transaction_type']?.toString();

    if (transactionType == null || transactionType.isEmpty) {
      _showStartupFailure('The transaction type is unavailable.');
      return;
    }

    // Centrally managed Global Personal automation is available to both
    // Free and Paid Personal accounts. Paid status only controls whether
    // this account may use its own Personal Flow Builder override.
    //
    // Keep the legacy automation_entitled fallback branch below for
    // compatibility with an older backend response during rollout.
    final automationEntitled = transaction['automation_entitled'] == true;
    final personalOverrideEntitled =
        transaction['personal_override_entitled'] == true;

    if (widget.isPersonal && !automationEntitled) {
      final manualDialCode =
          transaction['manual_dial_code']?.toString().trim() ?? '';

      if (manualDialCode.isEmpty) {
        const reason =
            'No manual USSD dial code is configured for this transaction.';
        if (mounted) setState(() => _simWarning = reason);
        await _reportResult(
          transactionId,
          const USSDResult(
            outcome: USSDStatus.failed,
            failureReason: reason,
            sessionLog: [],
          ),
        );
        return;
      }

      if (mounted) {
        setState(() {
          _status = USSDStatus.processing;
          _statusMessage =
              'Complete the transaction in the network USSD menu, then return to AgentPro.';
        });
      }

      // Install the lifecycle waiter BEFORE starting ACTION_CALL so a fast
      // Android pause event cannot race ahead of the Flutter continuation.
      final manualDialResumeCompleter = Completer<void>();
      _manualDialResumeCompleter = manualDialResumeCompleter;
      _manualDialSawBackground = false;

      try {
        await UssdAccessibilityEngine.dialManual(
          dialCode: manualDialCode,
          simSlot: simSlot,
        );
      } catch (_) {
        if (identical(
          _manualDialResumeCompleter,
          manualDialResumeCompleter,
        )) {
          _manualDialResumeCompleter = null;
          _manualDialSawBackground = false;
        }

        if (!manualDialResumeCompleter.isCompleted) {
          manualDialResumeCompleter.complete();
        }

        const reason = 'AgentPro could not open the network USSD menu.';
        if (mounted) setState(() => _simWarning = reason);
        await _reportResult(
          transactionId,
          const USSDResult(
            outcome: USSDStatus.failed,
            failureReason: reason,
            sessionLog: [],
          ),
        );
        return;
      }

      // ACTION_CALL only confirms that Android accepted the outgoing USSD
      // intent. Wait until AgentPro actually resumes after the user finishes
      // with the network-owned screen before asking for the outcome.
      await manualDialResumeCompleter.future;

      if (!mounted) return;

      // AgentPro intentionally cannot infer a Free user's result because it
      // does not observe or navigate the manual USSD session. The user must
      // report the actual network outcome after returning to the app.
      await _confirmManually(requiredChoice: true);
      return;
    }

    final bundleCategory = widget.data['bundle_category'] as String?;
    final recipientMode = widget.data['recipient_mode'] as String?;
    final selectionsInOrder =
        (widget.data['selections_in_order'] as List?)?.cast<String>() ??
            const [];
    final isMtnAccessibilityFlow = expectedBusinessRole == 'agent' &&
        provider == 'mtn' &&
        (transactionType == 'cash_in' ||
            transactionType == 'cash_out' ||
            transactionType == 'send_money');

    final isTelecelDepositFlow = expectedBusinessRole == 'agent' &&
        provider == 'telecel' &&
        transactionType == 'cash_in';

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
    if (provider == 'telecel') {
      if (!mounted) return;

      final authState = context.read<AuthBloc>().state;
      telecelOperatorId = authState is AuthAuthenticated
          ? authState.user['telecel_operator_id'] as String?
          : null;
    }

    if (isMtnAccessibilityFlow || isTelecelDepositFlow) {
      await _startAccessibilityAutomation(
        transactionId,
        automationParams,
        transactionType,
        provider,
        telecelOperatorId,
        simSlot: simSlot,
        businessSimRole: expectedBusinessRole,
      );
      return;
    }

    if (mounted) setState(() => _statusMessage = 'Looking up automation...');

    // A flow explicitly supplied in the transaction payload belongs to
    // the genuine offline path created by TransactionScreen. The device
    // cannot ask the server for fresher configuration in that situation,
    // so this scoped cached flow is intentionally authoritative for this
    // offline attempt.
    final suppliedCachedFlow = transaction['cached_flow'];

    if (suppliedCachedFlow is Map) {
      await _startResolvedFlow(
        transactionId: transactionId,
        automationParams: Map<String, String>.from(automationParams),
        transactionType: transactionType,
        provider: provider,
        telecelOperatorId: telecelOperatorId,
        simSlot: simSlot,
        businessSimRole: expectedBusinessRole,
        flowData: Map<String, dynamic>.from(suppliedCachedFlow),
        selectionsInOrder: selectionsInOrder,
      );
      return;
    }

    // Online-started transactions must ask the server for the current active
    // Custom USSD flow before executing local automation. The local cache is
    // only a transient-failure fallback and must never override an
    // authoritative server response.
    // A Free/expired Personal account must never execute a cached
    // Personal-owned override left behind from an earlier Paid session.
    // Its online resolver is authoritative and returns Global-only.
    final fallbackCachedFlow = widget.isPersonal && !personalOverrideEntitled
        ? null
        : OfflineQueueService.getCachedFlow(
            provider,
            transactionType,
            identity: _offlineIdentity,
            isPersonal: widget.isPersonal,
            businessSimRole: expectedBusinessRole ?? 'agent',
            bundleCategory: bundleCategory,
            recipientMode: recipientMode,
          );

    try {
      final resolveRes = await ApiClient.instance.get(
        widget.isPersonal
            ? '/personal-ussd-flows/resolve'
            : '/ussd-flows/resolve',
        queryParameters: {
          'provider': provider,
          'transaction_type': transactionType,
          if (widget.isPersonal == false)
            'sim_role': expectedBusinessRole ?? 'agent',
          if (bundleCategory != null) 'bundle_category': bundleCategory,
          if (recipientMode != null) 'recipient_mode': recipientMode,
        },
      );

      final rawFlowData = resolveRes.data['data'];

      if (rawFlowData is! Map) {
        throw const FormatException(
          'Invalid USSD flow response',
        );
      }

      final flowData = Map<String, dynamic>.from(rawFlowData);

      await OfflineQueueService.cacheFlow(
        provider,
        transactionType,
        flowData,
        identity: _offlineIdentity,
        isPersonal: widget.isPersonal,
        businessSimRole: expectedBusinessRole ?? 'agent',
        bundleCategory: bundleCategory,
        recipientMode: recipientMode,
      );

      await _startResolvedFlow(
        transactionId: transactionId,
        automationParams: Map<String, String>.from(automationParams),
        transactionType: transactionType,
        provider: provider,
        telecelOperatorId: telecelOperatorId,
        simSlot: simSlot,
        businessSimRole: expectedBusinessRole,
        flowData: flowData,
        selectionsInOrder: selectionsInOrder,
      );
      return;
    } on DioException catch (error) {
      final statusCode = error.response?.statusCode;
      final responseData = error.response?.data;
      final errorCode =
          responseData is Map ? responseData['code']?.toString() : null;

      if (errorCode == 'USSD_FLOW_INVALID_CONFIGURATION') {
        await OfflineQueueService.deleteCachedFlow(
          provider,
          transactionType,
          identity: _offlineIdentity,
          isPersonal: widget.isPersonal,
          businessSimRole: expectedBusinessRole ?? 'agent',
          bundleCategory: bundleCategory,
          recipientMode: recipientMode,
        );

        final reason = responseData is Map
            ? responseData['message']?.toString() ??
                'The configured USSD flow is invalid.'
            : 'The configured USSD flow is invalid.';

        if (mounted) {
          setState(() => _simWarning = reason);
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

      if (statusCode == 404) {
        // The server is authoritative. No active flow exists anymore for
        // this exact provider/type/variant, so remove its stale local copy.
        await OfflineQueueService.deleteCachedFlow(
          provider,
          transactionType,
          identity: _offlineIdentity,
          isPersonal: widget.isPersonal,
          businessSimRole: expectedBusinessRole ?? 'agent',
          bundleCategory: bundleCategory,
          recipientMode: recipientMode,
        );
      } else if (fallbackCachedFlow != null &&
          shouldFallbackToCachedUssdFlow(
            hasHttpResponse: error.response != null,
            statusCode: statusCode,
          )) {
        await _startResolvedFlow(
          transactionId: transactionId,
          automationParams: Map<String, String>.from(automationParams),
          transactionType: transactionType,
          provider: provider,
          telecelOperatorId: telecelOperatorId,
          simSlot: simSlot,
          businessSimRole: expectedBusinessRole,
          flowData: fallbackCachedFlow,
          selectionsInOrder: selectionsInOrder,
        );
        return;
      }
    } catch (_) {
      // A malformed online response is not permission to execute an older
      // cached flow. Continue to normal template/no-automation handling.
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
        const USSDResult(
          outcome: USSDStatus.failed,
          failureReason: reason,
          sessionLog: [],
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
    _engineProgressSubscription?.cancel();

    _engineProgressSubscription = _engine!.progressStream.listen((progress) {
      if (mounted) {
        setState(() {
          _status = progress.status;
          _statusMessage = progress.message;
        });
      }
    });

    // Execute USSD
    final result = await _engine!.execute();

    if (_requiresPostPinConfirmation(result)) {
      await _confirmManually(requiredChoice: true);
      return;
    }

    // Report result to backend
    await _reportResult(transactionId, result);
  }

  int? _parseSimSlot(dynamic value) {
    if (value is int) {
      return value;
    }

    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value?.toString() ?? '');
  }

  Future<Map<String, dynamic>> _resolveTransactionData() async {
    if (_resolvedTransaction != null) {
      return Map<String, dynamic>.from(_resolvedTransaction!);
    }

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

  void _showStartupFailure(String message) {
    _pulseCtrl.stop();

    if (!mounted) return;

    setState(() {
      _status = USSDStatus.failed;
      _outcome = USSDStatus.failed;
      _failureReason = message;
      _statusMessage = message;
      _completed = true;
      _resultRecordedAt ??= DateTime.now();
    });
  }

  Future<void> _startResolvedFlow({
    required String transactionId,
    required Map<String, String> automationParams,
    required String transactionType,
    required String provider,
    required String? telecelOperatorId,
    required int simSlot,
    String? businessSimRole,
    required Map<String, dynamic> flowData,
    required List<String> selectionsInOrder,
  }) async {
    final rawSteps = flowData['steps'];
    final dialCode = flowData['dial_code'];

    final executionMode =
        flowData['execution_mode']?.toString().trim().toLowerCase() ??
            'interactive';

    if (rawSteps is! List || dialCode is! String || dialCode.isEmpty) {
      throw const FormatException('Cached USSD flow is incomplete');
    }

    final steps =
        rawSteps.map((step) => Map<String, dynamic>.from(step as Map)).toList();

    // Never trust historical/offline configuration solely because it came
    // from the scoped cache or database. Validate again at the final device
    // execution boundary before Accessibility is allowed to act on it.
    final allowPinless = isTrustedPinlessPersonalRuntimeFlow(
      isPersonal: widget.isPersonal,
      provider: provider,
      transactionType: transactionType,
      dialCode: dialCode,
      flowData: flowData,
    );

    final flowValidationError = validateUssdFlowDraftSteps(
      steps,
      allowPinless: allowPinless,
      executionMode: executionMode,
    );

    if (flowValidationError != null) {
      final reason =
          'USSD automation configuration is unsafe: $flowValidationError';

      if (mounted) {
        setState(() => _simWarning = reason);
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

    final successMarkers = (flowData['success_markers'] as List?)
        ?.map((value) => value.toString())
        .toList();

    final failureMarkers = (flowData['failure_markers'] as List?)
        ?.map((value) => value.toString())
        .toList();

    final metadataValidationError = validateUssdFlowDraftMetadata(
      dialCode: dialCode,
      successMarkers: successMarkers ?? const <String>[],
      failureMarkers: failureMarkers ?? const <String>[],
    );

    if (metadataValidationError != null) {
      final reason =
          'USSD automation metadata is unsafe: $metadataValidationError';

      if (mounted) {
        setState(() => _simWarning = reason);
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

    if (executionMode == 'direct') {
      await _startDirectUssdAutomation(
        transactionId: transactionId,
        automationParams: automationParams,
        provider: provider,
        simSlot: simSlot,
        flowData: flowData,
        dialCode: dialCode,
        successMarkers: successMarkers,
        failureMarkers: failureMarkers,
      );
      return;
    }

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
      businessSimRole: businessSimRole,
      dialCode: dialCode,
      steps: steps,
      successMarkers: successMarkers,
      failureMarkers: failureMarkers,
      selections: selectionsMap.isEmpty ? null : selectionsMap,
    );
  }

  Future<void> _startDirectUssdAutomation({
    required String transactionId,
    required Map<String, String> automationParams,
    required String provider,
    required int simSlot,
    required Map<String, dynamic> flowData,
    required String dialCode,
    required List<String>? successMarkers,
    required List<String>? failureMarkers,
  }) async {
    final template = USSDTemplate(
      id: flowData['id']?.toString() ?? 'direct_custom_flow',
      ussdStringPattern: dialCode,
      pinPromptStrings: const ['pin'],
      successStrings: successMarkers ?? const <String>[],
      failureStrings: failureMarkers ?? const <String>[],
      timeoutSeconds: 30,
      retryCount: 0,
    );

    _engine = USSDEngine(
      template: template,
      automationParams: automationParams,
      provider: provider,
      simSlot: simSlot,
    );

    _engineProgressSubscription?.cancel();

    _engineProgressSubscription = _engine!.progressStream.listen((progress) {
      if (!mounted) return;

      setState(() {
        _status = progress.status;
        _statusMessage = progress.message;
      });
    });

    final result = await _engine!.execute();

    if (_requiresPostPinConfirmation(result)) {
      await _confirmManually(requiredChoice: true);
      return;
    }

    await _reportResult(transactionId, result);
  }

  Future<void> _waitForAndroidSettingsRoundTrip(
    Future<void> Function() openSettings,
  ) async {
    final completer = Completer<void>();

    _settingsResumeCompleter = completer;
    _settingsSawBackground = false;

    try {
      await openSettings();
      await completer.future;
    } finally {
      if (identical(_settingsResumeCompleter, completer)) {
        _settingsResumeCompleter = null;
        _settingsSawBackground = false;
      }
    }
  }

  Future<bool> _showRestrictedSettingHelp() async {
    if (!mounted) return false;

    final openAppInfo = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Accessibility is still off'),
        content: const Text(
          'If Android shows “Restricted setting”, open AgentPro App info, '
          'tap ⋮, choose Allow restricted settings, then return here.\n\n'
          'AgentPro cannot change this Android security setting for you.',
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop(false);
            },
            child: const Text('Not Now'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop(true);
            },
            child: const Text('Open AgentPro App Info'),
          ),
        ],
      ),
    );

    return openAppInfo == true;
  }

  Future<bool> _guideAccessibilitySetup(
    UssdAccessibilityEngine accessEngine,
  ) async {
    await _waitForAndroidSettingsRoundTrip(
      accessEngine.openAccessibilitySettings,
    );

    if (!mounted) return false;

    if (await accessEngine.isServiceEnabled()) {
      return true;
    }

    final openAppInfo = await _showRestrictedSettingHelp();

    if (!mounted || !openAppInfo) {
      return false;
    }

    await _waitForAndroidSettingsRoundTrip(
      accessEngine.openAppSettings,
    );

    if (!mounted) return false;

    // Returning from App Info means the user has had the opportunity to
    // approve Android's own "Allow restricted settings" control. AgentPro
    // still cannot grant Accessibility itself, so reopen the system
    // Accessibility screen for the final user-controlled switch.
    await _waitForAndroidSettingsRoundTrip(
      accessEngine.openAccessibilitySettings,
    );

    if (!mounted) return false;

    return accessEngine.isServiceEnabled();
  }

  Future<void> _startAccessibilityAutomation(
    String transactionId,
    Map<String, String> automationParams,
    String transactionType,
    String provider,
    String? operatorId, {
    required int simSlot,
    String? businessSimRole,
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
        (provider == 'mtn' && transactionType == 'send_money')
            ? 'cash_in'
            : transactionType;
    final phoneForAutomation = transactionType == 'send_money'
        ? automationParams['recipient_phone']
        : automationParams['customer_phone'];

    final accessEngine = UssdAccessibilityEngine();

    var enabled = await accessEngine.isServiceEnabled();

    if (!enabled) {
      if (!mounted) return;

      final consented = await showUssdAccessibilityDisclosure(
        context,
      );

      if (!mounted) return;

      if (!consented) {
        const reason =
            'USSD automation was not enabled. No USSD request was sent.';

        setState(() => _simWarning = reason);

        await _reportResult(
          transactionId,
          const USSDResult(
            outcome: USSDStatus.failed,
            failureReason: reason,
            sessionLog: [],
          ),
        );

        return;
      }

      try {
        enabled = await _guideAccessibilitySetup(
          accessEngine,
        );
      } catch (_) {
        const settingsReason =
            'AgentPro could not open the required Android Settings screen. '
            'No USSD request was sent.';

        if (mounted) {
          setState(() => _simWarning = settingsReason);
        }

        await _reportResult(
          transactionId,
          const USSDResult(
            outcome: USSDStatus.failed,
            failureReason: settingsReason,
            sessionLog: [],
          ),
        );

        return;
      }

      if (!mounted) return;

      if (!enabled) {
        const reason =
            'USSD automation was not enabled. No USSD request was sent.';

        setState(() => _simWarning = reason);

        await _reportResult(
          transactionId,
          const USSDResult(
            outcome: USSDStatus.failed,
            failureReason: reason,
            sessionLog: [],
          ),
        );

        return;
      }

      // Accessibility is now enabled. Continue this same transaction;
      // do not force the user to restart it.
      setState(() => _simWarning = null);
    }

    _accessibilityProgressSubscription?.cancel();

    _accessibilityProgressSubscription = accessEngine.progressStream.listen((
      progress,
    ) {
      if (mounted) {
        setState(() {
          _status = progress.status;
          _statusMessage = progress.message;
        });
      }
    });

    final result = await accessEngine.execute(
      customerPhone: phoneForAutomation,
      amount: automationParams['amount'],
      transactionType: nativeTransactionType,
      provider: provider,
      businessSimRole: businessSimRole,
      operatorId: operatorId,
      reference: automationParams['payment_reference'],
      merchantId: automationParams['merchant_id'],
      simSlot: simSlot,
      dialCode: dialCode,
      steps: steps,
      successMarkers: successMarkers,
      failureMarkers: failureMarkers,
      selections: selections,
    );

    accessEngine.dispose();

    if (_requiresPostPinConfirmation(result)) {
      await _confirmManually(requiredChoice: true);
      return;
    }

    await _reportResult(transactionId, result);
  }

  String _providerLabel(String provider) => switch (provider) {
        'mtn' => 'MTN',
        'telecel' => 'Telecel',
        'at_money' => 'AT Money',
        _ => provider.toUpperCase(),
      };

  // Manual resolution for an ambiguous post-PIN outcome. The USSD
  // engine owns the timeout and invokes this path only after it can no
  // longer determine a final network result. The app never guesses:
  // the user must state what the real network screen reported.
  Future<void> _confirmManually({bool requiredChoice = false}) async {
    final outcome = await showDialog<USSDStatus>(
      context: context,
      barrierDismissible: !requiredChoice,
      builder: (ctx) => PopScope(
        canPop: !requiredChoice,
        child: AlertDialog(
          title: const Text('Did the transaction succeed?'),
          content: const Text(
            'Check the result shown on your network screen, then choose what it said.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, USSDStatus.failed),
              child: const Text('Failed'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, USSDStatus.success),
              child: const Text('Successful'),
            ),
          ],
        ),
      ),
    );
    if (outcome == null) return;
    _wasManuallyConfirmed = true;

    final transaction = _resolvedTransaction ??
        (widget.data['transaction'] is Map
            ? Map<String, dynamic>.from(widget.data['transaction'] as Map)
            : null);

    final transactionId = transaction?['transaction_id']?.toString();

    if (transactionId == null || transactionId.isEmpty) {
      _showStartupFailure('The transaction reference is unavailable.');
      return;
    }

    await _reportResult(
      transactionId,
      USSDResult(
        outcome: outcome,
        failureReason: outcome == USSDStatus.failed
            ? 'Manually confirmed as failed by agent'
            : null,
        sessionLog: const [],
      ),
    );

    // A required post-PIN decision must not disappear from the screen
    // unless AgentPro actually persisted it or safely queued it for sync.
    // _reportResult sets _completedTransaction for server success and for
    // offline/pending-sync completion. A real server-side rejection leaves
    // it null so the user remains on the result screen instead of assuming
    // their Successful/Failed choice was recorded.
    if (requiredChoice &&
        _completedTransaction != null &&
        mounted &&
        context.canPop()) {
      context.pop();
    }
  }

  bool _requiresPostPinConfirmation(USSDResult result) {
    if (result.outcome != USSDStatus.pendingConfirmation) {
      return false;
    }

    final reason = result.failureReason?.toLowerCase() ?? '';

    return reason.contains(
          'no final network result was received after pin entry',
        ) ||
        reason.contains('could not confirm the outcome after pin entry');
  }

  bool _isAmbiguousMissingResult(
    USSDStatus outcome,
    String? failureReason,
  ) {
    final reason = failureReason?.toLowerCase() ?? '';

    return outcome == USSDStatus.failed &&
        (reason.contains('no response received from the network') ||
            reason.contains('no response received from the ussd session'));
  }

  bool _shouldReturnAfterMissingResult(USSDResult result) {
    return _isAmbiguousMissingResult(
      result.outcome,
      result.failureReason,
    );
  }

  bool get _canRetryDefiniteFailure {
    return _outcome == USSDStatus.failed &&
        _completedTransaction != null &&
        !_isAmbiguousMissingResult(_outcome, _failureReason);
  }

  Future<void> _returnToTransactionAfterMissingResult(USSDResult result) async {
    if (!mounted) return;

    _pulseCtrl.stop();

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'No USSD response was received. Returning to the transaction page in 10 seconds.',
        ),
      ),
    );

    await Future<void>.delayed(const Duration(seconds: 10));

    if (mounted && context.canPop()) {
      context.pop();
    }
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
    if (transactionId.startsWith('local_')) {
      final requestFields = Map<String, dynamic>.from(
        widget.data['request_fields'] as Map,
      );
      await OfflineQueueService.queueTransaction(
        identity: _offlineIdentity!,
        requestFields: requestFields,
        status: statusString,
        networkReference: result.networkReference,
        failureReason: result.failureReason,
        sessionLog: result.sessionLog,
        isPersonal: widget.isPersonal,
      );
      if (mounted) {
        setState(() {
          _completed = true;
          _resultRecordedAt ??= DateTime.now();
          _outcome = result.outcome;
          _failureReason = result.failureReason;
          _completedTransaction = {
            'reference': transactionId,
            'status': statusString,
            'offline_pending_sync': true,
          };
        });
      }

      if (_shouldReturnAfterMissingResult(result)) {
        await _returnToTransactionAfterMissingResult(result);
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
          _resultRecordedAt ??= DateTime.now();
          _outcome = result.outcome;
          _failureReason = result.failureReason;
          _completedTransaction = res.data['data'];
        });
      }

      if (_shouldReturnAfterMissingResult(result)) {
        await _returnToTransactionAfterMissingResult(result);
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
          identity: _offlineIdentity!,
          transactionId: transactionId,
          status: statusString,
          networkReference: result.networkReference,
          failureReason: result.failureReason,
          sessionLog: result.sessionLog,
          isPersonal: widget.isPersonal,
        );
        if (mounted) {
          setState(() {
            _completed = true;
            _resultRecordedAt ??= DateTime.now();
            _outcome = result.outcome;
            _failureReason = result.failureReason;
            _completedTransaction = {
              'reference': transactionId,
              'status': statusString,
              'offline_pending_sync': true,
            };
          });
        }

        if (_shouldReturnAfterMissingResult(result)) {
          await _returnToTransactionAfterMissingResult(result);
        }
        return;
      }
      if (mounted) {
        setState(() {
          _completed = true;
          _resultRecordedAt ??= DateTime.now();
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
          title: Text(
            _completed ? 'Transaction Result' : 'Processing Transaction',
          ),
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
    final rawType = widget.data['transaction_type']?.toString() ?? '';
    final type = rawType.isEmpty ? '' : transactionTypeLabel(rawType, provider);

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
                        AppTheme.secondaryColor.withValues(alpha: 0.18),
                        AppTheme.secondaryColor.withValues(alpha: 0.06),
                      ]
                    : [
                        AppTheme.primaryColor.withValues(alpha: 0.16),
                        AppTheme.primaryColor.withValues(alpha: 0.05),
                      ],
              ),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: isAwaitingPIN
                    ? AppTheme.secondaryColor.withValues(alpha: 0.35)
                    : AppTheme.primaryColor.withValues(alpha: 0.25),
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
                          ? AppTheme.secondaryColor.withValues(
                              alpha: 0.12 + (_pulseCtrl.value * 0.13),
                            )
                          : AppTheme.primaryColor.withValues(
                              alpha: 0.10 + (_pulseCtrl.value * 0.12),
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
                  color: Colors.black.withValues(alpha: 0.05),
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
                  color: AppTheme.secondaryColor.withValues(alpha: 0.55),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(
                        Icons.shield_outlined,
                        color: AppTheme.secondaryColor,
                      ),
                      SizedBox(width: 9),
                      Expanded(
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

  String _resultTimeLabel(DateTime value) {
    final hour = value.hour == 0
        ? 12
        : value.hour > 12
            ? value.hour - 12
            : value.hour;
    final minute = value.minute.toString().padLeft(2, '0');
    final period = value.hour >= 12 ? 'PM' : 'AM';

    return '${value.day.toString().padLeft(2, '0')}/'
        '${value.month.toString().padLeft(2, '0')}/${value.year} · '
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
              color: AppTheme.primaryColor.withValues(alpha: 0.09),
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
        color: color.withValues(alpha: context.isDarkMode ? 0.13 : 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.32)),
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
        simSlot: _parseSimSlot(widget.data['sim_slot']),
      );
    }

    context.go(widget.isPersonal ? '/personal-home' : '/agent');
  }

  bool _isRetryableInitiationError(DioException error) {
    final statusCode = error.response?.statusCode;

    // No response is ambiguous: the server may already have created the
    // transaction even though the phone never received the response.
    // Retrying these cases with the same client_operation_id is safe.
    return error.response == null ||
        statusCode == 408 ||
        statusCode == 429 ||
        (statusCode != null && statusCode >= 500);
  }

  Future<void> _retryStartupInitiation() async {
    final rawRequestFields = widget.data['request_fields'];

    if (rawRequestFields is! Map) {
      _startupInitiationRetryAvailable = false;
      _showStartupFailure('The original transaction request is unavailable.');
      return;
    }

    final requestFields = Map<String, dynamic>.from(rawRequestFields);

    _pulseCtrl.repeat(reverse: true);

    if (mounted) {
      setState(() {
        _status = USSDStatus.idle;
        _statusMessage = 'Retrying transaction initiation...';
        _completed = false;
        _outcome = USSDStatus.failed;
        _failureReason = null;
        _completedTransaction = null;
        _resolvedTransaction = null;
        _resultRecordedAt = null;
        _startupInitiationRetryAvailable = false;
      });
    }

    try {
      // Re-submit the exact original request. In particular,
      // client_operation_id must remain unchanged.
      final response = await ApiClient.instance.post(
        '/transactions',
        data: requestFields,
      );

      final rawTransaction = response.data['data'];

      if (rawTransaction is! Map) {
        throw const FormatException('Invalid transaction initiation response');
      }

      _resolvedTransaction = Map<String, dynamic>.from(rawTransaction);

      await _startUSSD();
    } on DioException catch (error) {
      final responseData = error.response?.data;
      final message =
          responseData is Map ? responseData['message']?.toString() : null;

      _startupInitiationRetryAvailable = _isRetryableInitiationError(error);

      _showStartupFailure(message ?? 'Failed to initiate transaction.');
    } on FormatException catch (error) {
      _startupInitiationRetryAvailable = false;
      _showStartupFailure(error.message);
    } catch (_) {
      _startupInitiationRetryAvailable = false;
      _showStartupFailure(
        'The transaction could not be started. Please try again.',
      );
    }
  }

  void _retryNow() {
    if (!_canRetryDefiniteFailure || !mounted || !context.canPop()) {
      return;
    }

    context.pop('retry_now');
  }

  void _editAndRetry() {
    if (!_canRetryDefiniteFailure || !mounted || !context.canPop()) {
      return;
    }

    context.pop('edit_retry');
  }

  Widget _buildResult() {
    final rawAmount = widget.data['amount']?.toString() ?? '';
    final parsedAmount =
        double.tryParse(rawAmount.replaceAll(',', '').trim()) ?? 0;
    final showAmount = parsedAmount > 0;

    final rawType = widget.data['transaction_type']?.toString() ?? '';
    final provider = widget.data['provider']?.toString() ?? '';
    final transactionType =
        rawType.isEmpty ? '' : transactionTypeLabel(rawType, provider);
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
    final canRetryDefiniteFailure = _canRetryDefiniteFailure;
    final resultTime = _resultRecordedAt ?? DateTime.now();
    final resultTimeLabel = isSuccess
        ? 'Completed'
        : isPending
            ? 'Checked at'
            : 'Failed at';

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
              border: Border.all(color: statusColor.withValues(alpha: 0.22)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
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
                    color: statusColor.withValues(alpha: 0.11),
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
                    color: statusColor.withValues(alpha: 0.09),
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
                    value: compactTransactionReference(reference),
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
                  label: resultTimeLabel,
                  value: _resultTimeLabel(resultTime),
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
            const AppButton(
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
          ] else if (canRetryDefiniteFailure) ...[
            AppButton(
              label: 'Retry Now',
              icon: Icons.refresh_rounded,
              onPressed: _retryNow,
            ),
            const SizedBox(height: 12),
            AppButton(
              label: 'Edit & Retry',
              icon: Icons.edit_outlined,
              onPressed: _editAndRetry,
              outlined: true,
            ),
            const SizedBox(height: 12),
            AppButton(
              label: 'Go Home',
              icon: Icons.home_outlined,
              onPressed: () => _returnHome(refreshDashboard: false),
              outlined: true,
            ),
          ] else if (!widget.isPersonal &&
              _startupInitiationRetryAvailable) ...[
            AppButton(
              label: 'Retry Connection',
              icon: Icons.sync_rounded,
              onPressed: () {
                unawaited(_retryStartupInitiation());
              },
            ),
            const SizedBox(height: 12),
            AppButton(
              label: 'Go Home',
              icon: Icons.home_outlined,
              onPressed: () => _returnHome(refreshDashboard: false),
              outlined: true,
            ),
          ] else ...[
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
    WidgetsBinding.instance.removeObserver(this);

    final manualDialResumeCompleter = _manualDialResumeCompleter;
    _manualDialResumeCompleter = null;
    _manualDialSawBackground = false;

    if (manualDialResumeCompleter != null &&
        !manualDialResumeCompleter.isCompleted) {
      manualDialResumeCompleter.complete();
    }

    _pulseCtrl.dispose();

    _engineProgressSubscription?.cancel();
    _accessibilityProgressSubscription?.cancel();

    _engine?.dispose();
    super.dispose();
  }
}
