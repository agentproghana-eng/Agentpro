import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';
import '../../core/api/api_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/storage_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';

class CommissionTransferScreen extends StatefulWidget {
  final String provider;
  final int? initialSimSlot;
  final String? initialSimIccid;
  final int? initialSimSubscriptionId;

  const CommissionTransferScreen({
    super.key,
    required this.provider,
    this.initialSimSlot,
    this.initialSimIccid,
    this.initialSimSubscriptionId,
  });

  @override
  State<CommissionTransferScreen> createState() =>
      _CommissionTransferScreenState();
}

class _CommissionTransferScreenState extends State<CommissionTransferScreen> {
  final _amountCtrl = TextEditingController();

  double _available = 0;
  double _legacyUnassignedCommission = 0;

  bool _loadingBalance = true;
  bool _loadingSims = true;
  bool _submitting = false;
  bool _exactWalletExists = false;
  bool _reconciliationRequired = false;

  String? _error;
  String? _simError;
  String? _balanceError;

  int _balanceRequestVersion = 0;

  List<SimCard> _providerSims = const [];
  int? _selectedSimSlot;
  bool _initialSimIdentityUnavailable = false;

  // Retained only while retrying the exact same initiation request.
  String? _pendingClientOperationId;
  double? _pendingClientOperationAmount;
  String? _pendingClientOperationSimIdentity;

  SimCard? get _selectedSim {
    for (final sim in _providerSims) {
      if (sim.slot == _selectedSimSlot) return sim;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _loadProviderSims();
  }

  Future<void> _loadProviderSims() async {
    try {
      var sims = await SimCardService.getSimCards();

      // Android can briefly return no subscriptions during cold start.
      if (sims.isEmpty) {
        await Future.delayed(const Duration(milliseconds: 1200));
        if (!mounted) return;
        sims = await SimCardService.getSimCards();
      }

      final matches = sims
          .where((sim) => sim.network == widget.provider)
          .toList()
        ..sort((a, b) => a.slot.compareTo(b.slot));

      if (!mounted) return;

      final requestedIccid =
          (widget.initialSimIccid ?? '').trim();

      final routeRequestedExactSim =
          widget.initialSimSlot != null ||
          requestedIccid.isNotEmpty ||
          widget.initialSimSubscriptionId != null;

      SimCard? requestedSim;

      if (routeRequestedExactSim) {
        for (final sim in matches) {
          final slotMatches =
              widget.initialSimSlot == null ||
              sim.slot == widget.initialSimSlot;

          final identityMatches =
              requestedIccid.isNotEmpty
                  ? sim.iccid.trim() == requestedIccid &&
                      slotMatches
                  : slotMatches &&
                      widget.initialSimSubscriptionId != null &&
                      sim.subscriptionId ==
                          widget.initialSimSubscriptionId;

          if (identityMatches) {
            requestedSim = sim;
            break;
          }
        }
      }

      final noSimError = matches.isEmpty
          ? 'No ${_providerLabel(widget.provider)} SIM is available on this device.'
          : routeRequestedExactSim && requestedSim == null
              ? 'The selected physical SIM is no longer available on this device.'
              : null;

      setState(() {
        _providerSims = matches;
        _selectedSimSlot = routeRequestedExactSim
            ? requestedSim?.slot
            : (matches.isEmpty ? null : matches.first.slot);
        _initialSimIdentityUnavailable =
            routeRequestedExactSim && requestedSim == null;
        _loadingSims = false;
        _simError = noSimError;

        if (matches.isEmpty) {
          _loadingBalance = false;
          _balanceError = noSimError;
        }
      });

      if (matches.isNotEmpty) {
        await _loadExactSimBalance();
      }
    } on SimPermissionException {
      if (!mounted) return;

      const message =
          'Phone permission is required to identify the physical SIM used for this transfer.';

      setState(() {
        _loadingSims = false;
        _loadingBalance = false;
        _simError = message;
        _balanceError = message;
      });
    } catch (_) {
      if (!mounted) return;

      const message = 'Could not identify the SIM for this transfer.';

      setState(() {
        _loadingSims = false;
        _loadingBalance = false;
        _simError = message;
        _balanceError = message;
      });
    }
  }

  String _providerLabel(String provider) {
    switch (provider) {
      case 'mtn':
        return 'MTN';
      case 'telecel':
        return 'Telecel';
      case 'at_money':
        return 'AT Money';
      default:
        return provider;
    }
  }

  void _selectSim(int slot) {
    setState(() {
      _selectedSimSlot = slot;
      _initialSimIdentityUnavailable = false;
      _simError = null;

      // Changing the physical SIM changes the financial operation identity.
      _pendingClientOperationId = null;
      _pendingClientOperationAmount = null;
      _pendingClientOperationSimIdentity = null;
      _error = null;
    });

    _loadExactSimBalance();
  }

  bool _isRetryableInitiationError(DioException error) {
    final statusCode = error.response?.statusCode;

    return error.response == null ||
        statusCode == 408 ||
        statusCode == 429 ||
        (statusCode != null && statusCode >= 500);
  }

  Future<void> _loadExactSimBalance() async {
    final selectedSim = _selectedSim;

    if (selectedSim == null) {
      if (!mounted) return;

      setState(() {
        _available = 0;
        _legacyUnassignedCommission = 0;
        _exactWalletExists = false;
        _reconciliationRequired = false;
        _loadingBalance = false;
        _balanceError =
            'Select the physical SIM whose commission balance you want to view.';
      });

      return;
    }

    final requestVersion = ++_balanceRequestVersion;

    setState(() {
      // Clear the previous SIM's value immediately so it can never be
      // mistaken for the newly selected physical SIM.
      _available = 0;
      _legacyUnassignedCommission = 0;
      _exactWalletExists = false;
      _reconciliationRequired = false;
      _loadingBalance = true;
      _balanceError = null;
    });

    try {
      final queryParameters = <String, dynamic>{
        'provider': widget.provider,
        'sim_slot': selectedSim.slot,
      };

      final iccid = selectedSim.iccid.trim();

      if (iccid.isNotEmpty) {
        // ICCID is the durable physical-SIM identity.
        queryParameters['sim_iccid'] = iccid;
      } else {
        // Without ICCID, never fall back to provider or slot alone.
        // The backend requires the same conservative identity tuple used
        // by financial posting.
        final subscriptionId = selectedSim.subscriptionId;

        final installationId = await StorageService.getOrCreateInstallationId();

        queryParameters['installation_id'] = installationId;
        queryParameters['sim_subscription_id'] = subscriptionId;
      }

      final res = await ApiClient.instance.get(
        '/balances/sim-wallet',
        queryParameters: queryParameters,
      );

      final rawData = res.data['data'];

      if (rawData is! Map) {
        throw const FormatException(
          'Invalid SIM wallet balance response',
        );
      }

      final data = Map<String, dynamic>.from(rawData);

      final rawLegacy = data['legacy_unassigned'];

      final legacy =
          rawLegacy is Map ? Map<String, dynamic>.from(rawLegacy) : null;

      final trackedCommission = double.tryParse(
            data['commission_balance']?.toString() ?? '',
          ) ??
          0;

      final legacyCommission = double.tryParse(
            legacy?['commission_balance']?.toString() ?? '',
          ) ??
          0;

      if (!mounted || requestVersion != _balanceRequestVersion) {
        return;
      }

      setState(() {
        _available = trackedCommission;
        _legacyUnassignedCommission = legacyCommission;
        _exactWalletExists = data['exact_wallet_exists'] == true;
        _reconciliationRequired = data['reconciliation_required'] == true;
        _loadingBalance = false;
        _balanceError = null;
      });
    } on DioException catch (error) {
      if (!mounted || requestVersion != _balanceRequestVersion) {
        return;
      }

      final responseData = error.response?.data;

      final serverMessage =
          responseData is Map ? responseData['message']?.toString() : null;

      setState(() {
        _loadingBalance = false;
        _balanceError =
            serverMessage ?? 'Could not load the tracked balance for this SIM.';
      });
    } on FormatException catch (error) {
      if (!mounted || requestVersion != _balanceRequestVersion) {
        return;
      }

      setState(() {
        _loadingBalance = false;
        _balanceError = error.message;
      });
    } catch (_) {
      if (!mounted || requestVersion != _balanceRequestVersion) {
        return;
      }

      setState(() {
        _loadingBalance = false;
        _balanceError = 'Could not load the tracked balance for this SIM.';
      });
    }
  }

  // Actually dials the real MTN "My Wallet > Commissions > Transfer
  // Commission to Wallet" USSD flow via the same accessibility
  // automation pipeline every other transaction type uses - this used
  // to just call /balances/commission-transfer directly, which only
  // recorded a backend adjustment without ever touching the real
  // network, despite the on-screen text claiming otherwise.
  Future<void> _submit() async {
    final amount = double.tryParse(_amountCtrl.text);

    if (amount == null || amount <= 0) {
      setState(() => _error = 'Enter a valid amount');
      return;
    }

    final selectedSim = _selectedSim;

    if (selectedSim == null) {
      setState(() {
        _error = _simError ??
            'Select the physical SIM that will perform this transfer.';
      });
      return;
    }

    String installationId;
    try {
      installationId = await StorageService.getOrCreateInstallationId();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error =
            'AgentPro could not establish this device identity. Please try again.';
      });
      return;
    }

    final simIdentity = selectedSim.iccid.trim().isNotEmpty
        ? 'iccid:${selectedSim.iccid.trim()}|slot:${selectedSim.slot}'
        : 'fallback:$installationId:${selectedSim.subscriptionId}:${selectedSim.slot}';

    // Deliberately does NOT block on amount > _available. This is the
    // exact selected-SIM balance tracked by AgentPro; historical unassigned
    // money is deliberately excluded, and the provider remains the final
    // authority for what can actually be transferred on its network.
    setState(() {
      _submitting = true;
      _error = null;
    });

    // Reuse an operation ID only when this is the exact same amount and SIM
    // after an ambiguous initiation failure. A changed amount or SIM is a
    // genuinely new financial operation and receives a new UUID.
    final canReuseOperation = _pendingClientOperationId != null &&
        _pendingClientOperationAmount == amount &&
        _pendingClientOperationSimIdentity == simIdentity;

    final clientOperationId =
        canReuseOperation ? _pendingClientOperationId! : const Uuid().v4();

    _pendingClientOperationId = clientOperationId;
    _pendingClientOperationAmount = amount;
    _pendingClientOperationSimIdentity = simIdentity;

    final requestFields = <String, dynamic>{
      'provider': widget.provider,
      'transaction_type': 'commission_transfer',
      'amount': amount,
      'customer_phone': '',
      'customer_name': '',
      'recipient_phone': '',
      'biller_code': '',
      'account_number': '',
      'payment_reference': '',
      'fee': 0,
      'notes': '',
      'sim_iccid': selectedSim.iccid,
      'sim_slot': selectedSim.slot,
      'installation_id': installationId,
      'sim_subscription_id': selectedSim.subscriptionId,
      'client_operation_id': clientOperationId,
    };

    try {
      final res = await ApiClient.instance.post(
        '/transactions',
        data: requestFields,
      );

      final rawTransaction = res.data['data'];

      if (rawTransaction is! Map) {
        throw const FormatException(
          'Invalid transaction initiation response',
        );
      }

      if (!mounted) return;

      // The operation has now been definitively resolved to a backend
      // transaction. Any later retry after a real USSD failure must be a new
      // financial attempt rather than reuse this initiation UUID.
      _pendingClientOperationId = null;
      _pendingClientOperationAmount = null;
      _pendingClientOperationSimIdentity = null;

      context.push('/transactions/progress', extra: {
        'transaction': Map<String, dynamic>.from(rawTransaction),
        'provider': widget.provider,
        'transaction_type': 'commission_transfer',
        'amount': _amountCtrl.text,
        'customer_phone': '',
        'customer_name': '',
        'sim_slot': selectedSim.slot,
        'sim_iccid': selectedSim.iccid,
        'sim_subscription_id': selectedSim.subscriptionId,
        'request_fields': requestFields,
      });
    } on DioException catch (error) {
      final responseData = error.response?.data;
      final serverMessage =
          responseData is Map ? responseData['message']?.toString() : null;

      final retryable = _isRetryableInitiationError(error);

      if (!retryable) {
        // A definite HTTP rejection means no ambiguous transaction remains.
        _pendingClientOperationId = null;
        _pendingClientOperationAmount = null;
        _pendingClientOperationSimIdentity = null;
      }

      if (!mounted) return;

      setState(() {
        _error = serverMessage ??
            (retryable
                ? 'Connection problem while starting the transfer. Tap Dial to Transfer again to safely retry the same operation.'
                : 'Failed to start commission transfer');
        _submitting = false;
      });
    } on FormatException catch (error) {
      // Keep the UUID: the POST may have succeeded even if the response was
      // malformed locally. Reusing it is safer than creating a duplicate.
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _submitting = false;
      });
    } catch (_) {
      // Preserve the UUID for the same reason: an unexpected client-side
      // failure after POST must not cause a duplicate financial operation.
      if (!mounted) return;
      setState(() {
        _error =
            'The transfer could not be started. Tap Dial to Transfer again to safely retry.';
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Transfer Commission to e-Float')),
      body: _loadingSims
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16),
              child: ListView(children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: context.appSurface,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.06),
                        blurRadius: 4,
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      Text(
                        'AgentPro Tracked Commission • Selected SIM',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11,
                          color: context.appSecondaryText,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (_loadingBalance)
                        const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                          ),
                        )
                      else if (_balanceError != null) ...[
                        const Icon(
                          Icons.sync_problem_outlined,
                          color: AppTheme.errorColor,
                          size: 24,
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Tracked balance unavailable',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: AppTheme.errorColor,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _balanceError!,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 10.5,
                            color: context.appSecondaryText,
                          ),
                        ),
                      ] else ...[
                        Text(
                          'GH₵ ${_available.toStringAsFixed(2)}',
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.primaryColor,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _exactWalletExists
                              ? 'Exact SIM ledger balance'
                              : 'No exact SIM ledger activity recorded yet',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 10,
                            color: context.appSecondaryText,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (!_loadingBalance &&
                    _balanceError == null &&
                    _reconciliationRequired) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.secondaryColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.warning_amber_rounded,
                          color: AppTheme.secondaryColor,
                          size: 20,
                        ),
                        const SizedBox(width: 9),
                        Expanded(
                          child: Text(
                            'Historical unassigned commission: '
                            'GH₵ ${_legacyUnassignedCommission.toStringAsFixed(2)}. '
                            'This is not included in the selected SIM balance '
                            'because AgentPro cannot prove which physical SIM '
                            'owns it. Reconciliation is required.',
                            style: TextStyle(
                              fontSize: 10.5,
                              height: 1.35,
                              color: context.appSecondaryText,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                if (_simError != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.errorColor.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.sim_card_alert_outlined,
                          size: 18,
                          color: AppTheme.errorColor,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _simError!,
                            style: const TextStyle(
                              color: AppTheme.errorColor,
                              fontSize: 11,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                if (_providerSims.length > 1 ||
                    (_initialSimIdentityUnavailable &&
                        _providerSims.isNotEmpty)) ...[
                  Text(
                    'SIM to use',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: context.appSecondaryText,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _providerSims.map((sim) {
                      return ChoiceChip(
                        label: Text(
                          'SIM ${sim.slot + 1}'
                          '${sim.carrierName.isNotEmpty ? ' • ${sim.carrierName}' : ''}',
                        ),
                        selected: _selectedSimSlot == sim.slot,
                        onSelected: (_) => _selectSim(sim.slot),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),
                ] else if (_providerSims.length == 1 &&
                    !_initialSimIdentityUnavailable) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: context.appTileColor(const Color(0xFFE6F4F1)),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.sim_card_outlined, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Using SIM ${_providerSims.first.slot + 1}'
                            '${_providerSims.first.carrierName.isNotEmpty ? ' • ${_providerSims.first.carrierName}' : ''}',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                TextField(
                  controller: _amountCtrl,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                      labelText: 'Amount to Transfer',
                      prefixText: 'GH₵ ',
                      border: OutlineInputBorder()),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                      color: context.appTileColor(const Color(0xFFE6F4F1)),
                      borderRadius: BorderRadius.circular(10)),
                  child: Text(
                    "This dials your network's own USSD commission-transfer code directly. You will enter your MoMo PIN only on the official network screen.",
                    style: TextStyle(
                        fontSize: 11,
                        color: context.isDarkMode
                            ? AppTheme.primaryLight
                            : AppTheme.primaryColor),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!,
                      style: const TextStyle(color: AppTheme.errorColor)),
                ],
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Dial to Transfer'),
                ),
              ]),
            ),
    );
  }
}
