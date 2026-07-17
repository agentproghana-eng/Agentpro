import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../core/services/ussd_service.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/permission_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class TransactionProgressScreen extends StatefulWidget {
  final Map<String, dynamic> data;
  const TransactionProgressScreen({super.key, required this.data});

  @override
  State<TransactionProgressScreen> createState() => _TransactionProgressScreenState();
}

class _TransactionProgressScreenState extends State<TransactionProgressScreen>
    with TickerProviderStateMixin {
  late AnimationController _pulseCtrl;
  USSDStatus _status = USSDStatus.idle;
  String _statusMessage = 'Preparing transaction...';
  bool _completed = false;
  USSDStatus _outcome = USSDStatus.failed;
  String? _failureReason;
  Map<String, dynamic>? _completedTransaction;
  USSDEngine? _engine;
  String? _simWarning;
  bool _permissionPermanentlyDenied = false;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))
      ..repeat(reverse: true);
    _startUSSD();
  }

  Future<void> _startUSSD() async {
    final transaction = widget.data['transaction'] as Map<String, dynamic>;
    final template = transaction['ussd_template'] as Map<String, dynamic>;
    final automationParams = Map<String, String>.from(
      (transaction['automation_params'] as Map<String, dynamic>? ?? {})
          .map((k, v) => MapEntry(k, v?.toString() ?? '')));
    final provider = widget.data['provider'] as String;
    final transactionId = transaction['transaction_id'] as String;

    // USSD automation requires CALL_PHONE and READ_PHONE_STATE granted at
    // runtime (Android 6+) — request before touching SIM detection or dialing.
    final permissionResult = await PermissionService.requestTelephonyPermissions();
    if (permissionResult != PermissionResult.granted) {
      final reason = permissionResult == PermissionResult.permanentlyDenied
          ? 'Phone permission was denied. Enable it in Settings to process transactions.'
          : 'Phone permission is required to process Mobile Money transactions.';
      if (mounted) {
        setState(() {
          _simWarning = reason;
          _permissionPermanentlyDenied = permissionResult == PermissionResult.permanentlyDenied;
        });
      }
      await _reportResult(
        transactionId,
        USSDResult(outcome: USSDStatus.failed, failureReason: reason, sessionLog: const []),
      );
      return;
    }

    // Resolve which physical SIM slot carries this provider's network.
    // If the device has no SIM for the chosen provider, fail fast with a
    // clear message rather than dialing on the wrong network and burning
    // a confusing failed USSD session.
    int simSlot;
    try {
      final hasSim = await SimCardService.hasProviderSim(provider);
      if (!hasSim) {
        final reason = 'No ${_providerLabel(provider)} SIM card was detected on this device.';
        if (mounted) setState(() => _simWarning = reason);
        await _reportResult(
          transactionId,
          USSDResult(outcome: USSDStatus.failed, failureReason: reason, sessionLog: const []),
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
        USSDResult(outcome: USSDStatus.failed, failureReason: reason, sessionLog: const []),
      );
      return;
    } catch (_) {
      // SIM detection failed for an unexpected reason — fall back to slot 0
      // rather than blocking the transaction entirely.
      simSlot = 0;
    }

    // MTN Cash In cannot use single-dial USSD - confirmed via live testing
    // that even a 2-step concatenated string fails immediately on this
    // gateway. Route through the Accessibility Service pilot instead.
    final transactionType = widget.data["transaction_type"] as String?;
    if (provider == "mtn" && transactionType == "cash_in") {
      await _startAccessibilityCashIn(transactionId, automationParams);
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
        });
      }
    });

    // Execute USSD
    final result = await _engine!.execute();

    // Report result to backend
    await _reportResult(transactionId, result);
  }

  Future<void> _startAccessibilityCashIn(
    String transactionId,
    Map<String, String> automationParams,
  ) async {
    final accessEngine = UssdAccessibilityEngine();

    final enabled = await accessEngine.isServiceEnabled();
    if (!enabled) {
      const reason = "Accessibility permission is required for MTN Cash In "
          "automation. Enable Agent Pro Ghana under Settings > "
          "Accessibility, then try again.";
      if (mounted) setState(() => _simWarning = reason);
      await accessEngine.openAccessibilitySettings();
      await _reportResult(
        transactionId,
        USSDResult(outcome: USSDStatus.failed, failureReason: reason, sessionLog: const []),
      );
      return;
    }

    accessEngine.progressStream.listen((progress) {
      if (mounted) {
        setState(() {
          _status = progress.status;
          _statusMessage = progress.message;
        });
      }
    });

    final result = await accessEngine.execute(
      customerPhone: automationParams["customer_phone"] ?? "",
      amount: automationParams["amount"] ?? "",
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

    try {
      final res = await ApiClient.instance.patch(
        '/transactions/$transactionId/complete',
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
      if (mounted) {
        setState(() {
          _completed = true;
          _outcome = result.outcome;
          _failureReason = result.failureReason ??
              (e.response?.data?['message'] as String? ?? 'Could not sync with server');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _completed,
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          title: const Text('Processing Transaction'),
          automaticallyImplyLeading: _completed,
        ),
        body: _completed ? _buildResult() : _buildProgress(),
      ),
    );
  }

  Widget _buildProgress() {
    final isAwaitingPIN = _status == USSDStatus.awaitingPIN;

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Spacer(),

          // Animated status icon
          AnimatedBuilder(
            animation: _pulseCtrl,
            builder: (_, __) => Container(
              width: 100, height: 100,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isAwaitingPIN
                    ? AppTheme.secondaryColor.withOpacity(0.1 + _pulseCtrl.value * 0.2)
                    : AppTheme.primaryColor.withOpacity(0.1 + _pulseCtrl.value * 0.15),
              ),
              child: Icon(
                isAwaitingPIN ? Icons.lock_outline : Icons.swap_horiz,
                size: 44,
                color: isAwaitingPIN ? AppTheme.secondaryColor : AppTheme.primaryColor,
              ),
            ),
          ),

          const SizedBox(height: 24),

          Text(
            isAwaitingPIN ? 'PIN Entry Required' : 'Processing...',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 12),

          Text(
            _statusMessage,
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey[600], fontSize: 15),
          ),

          // PIN Warning
          if (isAwaitingPIN) ...[
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.amber[50],
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.amber[300]!),
              ),
              child: Column(
                children: [
                  const Row(
                    children: [
                      Icon(Icons.security, color: Colors.amber),
                      SizedBox(width: 8),
                      Expanded(child: Text('Enter PIN on Network Screen',
                        style: TextStyle(fontWeight: FontWeight.bold))),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'A network screen may appear asking for your MoMo PIN. '
                    'Please enter it there.\n\n'
                    '⚠️ Never share your PIN with anyone, including this app.',
                    style: TextStyle(fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'This may take up to a minute — please wait.',
                    style: TextStyle(fontSize: 12, color: Colors.amber[800]),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 32),

          // Single-dial flow: one indeterminate spinner rather than a
          // step-by-step progress list, since there's no longer a fixed
          // sequence of app-driven steps to visualize (see ussd_service.dart).
          SizedBox(
            width: 32, height: 32,
            child: CircularProgressIndicator(
              strokeWidth: 3,
              color: isAwaitingPIN ? AppTheme.secondaryColor : AppTheme.primaryColor,
            ),
          ),

          const Spacer(),

          Text('Do not close this screen', style: TextStyle(color: Colors.grey[400], fontSize: 12)),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildResult() {
    final amount = widget.data['amount']?.toString() ?? '';
    final txType = widget.data['transaction_type']?.toString().replaceAll('_', ' ') ?? '';
    final customerPhone = widget.data['customer_phone']?.toString() ?? '';
    final receiptUrl = _completedTransaction?['receipt_url'];
    final isSuccess = _outcome == USSDStatus.success;
    final isPending = _outcome == USSDStatus.pendingConfirmation;

    final (icon, color) = switch (_outcome) {
      USSDStatus.success => (Icons.check_circle, AppTheme.successColor),
      USSDStatus.pendingConfirmation => (Icons.help_outline, AppTheme.warningColor),
      _ => (_simWarning != null ? Icons.sim_card_alert_outlined : Icons.cancel, AppTheme.errorColor),
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
              width: 100, height: 100,
              decoration: BoxDecoration(shape: BoxShape.circle, color: color.withOpacity(0.1)),
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
            Text('GH₵ $amount', textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(txType.toUpperCase(), textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[600], letterSpacing: 1)),
            if (customerPhone.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(customerPhone, textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey[500])),
            ],
          ] else if (isPending) ...[
            Text('GH₵ $amount · ${txType.toUpperCase()}', textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[700], fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.warningColor.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.warningColor.withOpacity(0.3)),
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
            Text(_failureReason ?? 'The transaction could not be completed.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[600])),
          ],

          if (_completedTransaction?['reference'] != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.grey[100], borderRadius: BorderRadius.circular(8)),
              child: Column(
                children: [
                  _RefRow('Reference', _completedTransaction!['reference']),
                  if (_completedTransaction!['network_reference'] != null)
                    _RefRow('Network Ref', _completedTransaction!['network_reference']),
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
              onPressed: () { /* Open PDF */ },
              outlined: true,
            ),

          if (isPending)
            AppButton(
              label: 'Check Transaction History',
              icon: Icons.history,
              onPressed: () => context.push('/transactions'),
              outlined: true,
            ),

          const SizedBox(height: 12),

          AppButton(
            label: 'New Transaction',
            icon: Icons.add,
            onPressed: () => context.go('/agent'),
          ),

          const SizedBox(height: 12),

          TextButton(
            onPressed: () => context.push('/transactions/${_completedTransaction?['id']}'),
            child: const Text('View Transaction Details'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
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
          Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
          const Spacer(),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
        ],
      ),
    );
  }
}
