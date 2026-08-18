import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:uuid/uuid.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/utils/transaction_labels.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../../core/services/offline_queue_service.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/storage_service.dart';
import '../../core/services/transaction_device_preparation_service.dart';

class AgentTelecelBundleOption {
  final String label;
  final String digit;
  final double amount;

  const AgentTelecelBundleOption({
    required this.label,
    required this.digit,
    required this.amount,
  });
}

const List<AgentTelecelBundleOption> kAgentTelecelBundles = [
  AgentTelecelBundleOption(
    label: '1GB + 200 All-Net mins — GHS 10 — 15 days',
    digit: '1',
    amount: 10,
  ),
  AgentTelecelBundleOption(
    label: '200 All-Net Minutes — GHS 5 — 7 days',
    digit: '2',
    amount: 5,
  ),
  AgentTelecelBundleOption(
    label: '1.5GB — GHS 5 — 3 days',
    digit: '3',
    amount: 5,
  ),
  AgentTelecelBundleOption(
    label: '3.5GB — GHS 13 — 3 days',
    digit: '4',
    amount: 13,
  ),
];

class TransactionScreen extends StatefulWidget {
  final String transactionType;
  final String? initialProvider;
  final int? initialSimSlot;
  final String? initialSimIccid;
  final int? initialSimSubscriptionId;

  const TransactionScreen({
    super.key,
    required this.transactionType,
    this.initialProvider,
    this.initialSimSlot,
    this.initialSimIccid,
    this.initialSimSubscriptionId,
  });

  @override
  State<TransactionScreen> createState() => _TransactionScreenState();
}

class _TransactionScreenState extends State<TransactionScreen> {
  OfflineQueueIdentity? get _offlineIdentity {
    final state = context.read<AuthBloc>().state;
    return state is AuthAuthenticated
        ? OfflineQueueService.identityFromUser(state.user)
        : null;
  }

  final _formKey = GlobalKey<FormState>();
  final _customerPhoneCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  final _recipientPhoneCtrl = TextEditingController();
  final _referenceCtrl = TextEditingController();
  final _merchantIdCtrl = TextEditingController();
  final _feeCtrl = TextEditingController();

  String _selectedProvider =
      'mtn'; // overridden in initState if initialProvider is passed
  bool _loading = false;
  bool _feeAutoCalculated = true;
  Map<String, SimCard?>? _simMap;
  List<SimCard> _simCards = const [];
  int? _selectedSimSlot;
  bool _initialSimIdentityUnavailable = false;
  bool _simDetectionComplete = false;
  bool _simPermissionDenied = false;
  AgentTelecelBundleOption? _selectedTelecelBundle;

  // Retained only when manual Cash Out initiation ended ambiguously.
  // The fingerprint prevents reuse if amount/customer/provider/SIM changes.
  String? _pendingManualCashOutOperationId;
  String? _pendingManualCashOutFingerprint;

  Timer? _flowPreloadDebounce;
  final Set<String> _flowPreloadAttempts = {};

  @override
  void initState() {
    super.initState();

    if (widget.initialProvider != null) {
      _selectedProvider = widget.initialProvider!;
    }

    _selectedSimSlot = widget.initialSimSlot;
    // Pay to Agent and Pay to Merchant are both confirmed MTN-only
    // (mapped from MTN's own "Pay To" USSD menu) - force it regardless
    // of whatever provider filter was active on Home when this tile was
    // tapped, and hide the selector entirely so there's nothing
    // misleading to choose from.
    if (_needsReference) {
      _selectedProvider = 'mtn';
    }

    // Start SIM detection and flow warming only after the final initial
    // provider has been selected.
    _loadSimMap();
    _scheduleFlowPreload(immediate: true);

    _amountCtrl.addListener(() {
      if (!_isTransferChargeFlow || !_feeAutoCalculated) return;
      final amount = double.tryParse(_amountCtrl.text.replaceAll(',', '')) ?? 0;
      final fee = amount * 0.01;
      _feeCtrl.text = fee > 0 ? fee.toStringAsFixed(2) : '';
    });
  }

  String get _title =>
      transactionTypeLabel(widget.transactionType, _selectedProvider);

  bool get _providerLocked {
    final initialProvider = widget.initialProvider?.trim();

    return _needsReference ||
        (initialProvider != null && initialProvider.isNotEmpty);
  }

  String get _selectedProviderLabel => switch (_selectedProvider) {
        'mtn' => 'MTN',
        'telecel' => 'Telecel',
        'at_money' => 'AT Money',
        _ => _selectedProvider,
      };

  bool get _needsRecipient => ['send_money'].contains(widget.transactionType);
  // Pay to Agent and Pay to Merchant (MTN's "Pay To" menu, both
  // branches) - both confirmed via live device mapping to need a
  // free-text Reference. Agent additionally needs a phone number
  // (handled via _needsCustomer below); Merchant needs a Merchant ID
  // instead (_needsMerchantId). Neither uses a biller code or account
  // number - this fully replaces what used to be a biller-code-style
  // Bill Payment form. MTN-only for both.
  bool get _needsReference =>
      ['bill_payment', 'merchant_payment'].contains(widget.transactionType);
  bool get _needsMerchantId => widget.transactionType == 'merchant_payment';

  bool get _isTelecelDataBundle =>
      widget.transactionType == 'data_bundle' && _selectedProvider == 'telecel';

  bool _providerSupportsTransaction(String provider) {
    if (widget.transactionType == 'data_bundle') {
      return provider == 'mtn' || provider == 'telecel';
    }

    if (widget.transactionType == 'working_to_float' ||
        widget.transactionType == 'float_to_working') {
      return provider == 'telecel';
    }

    return true;
  }

  bool get _needsAmount =>
      ![
        'balance_enquiry',
        'mini_statement',
        'commission_balance',
        'cash_in_commission',
      ].contains(widget.transactionType) &&
      !_isTelecelDataBundle;
  // Telecel Agent Data Bundle selects the bundle directly from the
  // provider menu and does not ask for a customer phone. MTN Data Bundle
  // does ask for the recipient number, so it keeps the customer field.
  bool get _needsCustomer =>
      !_isTelecelDataBundle &&
      ![
        'balance_enquiry',
        'mini_statement',
        'send_money',
        'merchant_payment',
        'commission_balance',
        'cash_in_commission',
        'working_to_float',
        'float_to_working',
        'commission_transfer',
      ].contains(widget.transactionType);
  bool get _isMtnCashIn =>
      widget.transactionType == 'send_money' && _selectedProvider == 'mtn';

  bool get _isDeposit =>
      widget.transactionType == 'cash_in' &&
      (_selectedProvider == 'telecel' || _selectedProvider == 'at_money');

  // Transfer Charges default to 1% but remain editable because the
  // provider's actual charge can vary.
  bool get _isTransferChargeFlow => _isMtnCashIn || _isDeposit;

  // Telecel/AirtelTigo Cash Out: e-cash moves directly SIM-to-SIM,
  // invisible to USSD automation. No dial happens at all for this
  // combo - it's recorded manually instead. Promoted to a getter (not
  // just a local var in _proceed()) so the UI can also reflect this -
  // showing the actual PIN/USSD security notice here would be actively
  // wrong, since no PIN entry or dialing ever happens in this flow.
  bool get _isManualCashOut =>
      widget.transactionType == 'cash_out' &&
      (_selectedProvider == 'telecel' || _selectedProvider == 'at_money');

  List<String> get _availableProviders {
    if (!_simDetectionComplete) {
      return const <String>[];
    }

    return _simCards
        .where(
          (sim) =>
              sim.isMoMoSupported && _providerSupportsTransaction(sim.network),
        )
        .map((sim) => sim.network)
        .toSet()
        .toList();
  }

  List<SimCard> get _selectedProviderSims {
    if (!_providerSupportsTransaction(_selectedProvider)) {
      return const <SimCard>[];
    }

    return _simCards.where((sim) => sim.network == _selectedProvider).toList()
      ..sort((a, b) => a.slot.compareTo(b.slot));
  }

  SimCard? get _selectedSim {
    final sims = _selectedProviderSims;
    if (sims.isEmpty) return null;

    if (_selectedSimSlot != null) {
      for (final sim in sims) {
        if (sim.slot == _selectedSimSlot) return sim;
      }
    }

    // A route that explicitly requested a physical SIM must never
    // silently substitute another same-provider SIM.
    if (_initialSimIdentityUnavailable) {
      return null;
    }

    return sims.first;
  }

  Future<void> _loadSimMap() async {
    if (mounted) {
      setState(() {
        _simDetectionComplete = false;
        _simPermissionDenied = false;
      });
    }

    try {
      var sims = await SimCardService.getSimCards();

      if (sims.isEmpty) {
        await Future.delayed(const Duration(milliseconds: 1200));

        if (!mounted) return;

        sims = await SimCardService.getSimCards();
      }

      if (!mounted) return;

      final supportedSims = sims.where((sim) => sim.isMoMoSupported).toList()
        ..sort((a, b) => a.slot.compareTo(b.slot));

      final map = <String, SimCard?>{
        'mtn': supportedSims.where((sim) => sim.network == 'mtn').firstOrNull,
        'telecel':
            supportedSims.where((sim) => sim.network == 'telecel').firstOrNull,
        'at_money':
            supportedSims.where((sim) => sim.network == 'at_money').firstOrNull,
      };

      final available = supportedSims
          .where((sim) => _providerSupportsTransaction(sim.network))
          .map((sim) => sim.network)
          .toSet()
          .toList();

      var providerChanged = false;

      setState(() {
        _simMap = map;
        _simCards = supportedSims;
        _simDetectionComplete = true;
        _simPermissionDenied = false;

        if (!_providerLocked &&
            available.isNotEmpty &&
            !available.contains(_selectedProvider)) {
          providerChanged = true;
          _selectedProvider = available.first;
          _selectedTelecelBundle = null;
        }

        final providerSims = supportedSims
            .where(
              (sim) =>
                  sim.network == _selectedProvider &&
                  _providerSupportsTransaction(sim.network),
            )
            .toList()
          ..sort((a, b) => a.slot.compareTo(b.slot));

        final requestedIccid = (widget.initialSimIccid ?? '').trim();

        final routeRequestedExactSim = widget.initialSimSlot != null ||
            requestedIccid.isNotEmpty ||
            widget.initialSimSubscriptionId != null;

        SimCard? requestedSim;

        if (routeRequestedExactSim) {
          for (final sim in providerSims) {
            final slotMatches = widget.initialSimSlot == null ||
                sim.slot == widget.initialSimSlot;

            final identityMatches = requestedIccid.isNotEmpty
                // Identified SIM: ICCID + slot is canonical.
                // Subscription ID must not split an ICCID wallet.
                ? sim.iccid.trim() == requestedIccid && slotMatches
                // Unresolved SIM: current subscription + slot selects
                // the exact installation-local physical SIM.
                : slotMatches &&
                    widget.initialSimSubscriptionId != null &&
                    sim.subscriptionId == widget.initialSimSubscriptionId;

            if (identityMatches) {
              requestedSim = sim;
              break;
            }
          }
        }

        if (providerSims.isEmpty) {
          _selectedSimSlot = null;
          _initialSimIdentityUnavailable = routeRequestedExactSim;
        } else if (routeRequestedExactSim) {
          _selectedSimSlot = requestedSim?.slot;
          _initialSimIdentityUnavailable = requestedSim == null;
        } else if (!providerSims.any((sim) => sim.slot == _selectedSimSlot)) {
          _selectedSimSlot = providerSims.first.slot;
          _initialSimIdentityUnavailable = false;
        } else {
          _initialSimIdentityUnavailable = false;
        }
      });

      if (providerChanged) {
        _scheduleFlowPreload();
      }
    } on SimPermissionException {
      if (!mounted) return;

      setState(() {
        _simMap = const {'mtn': null, 'telecel': null, 'at_money': null};
        _simCards = const [];
        _selectedSimSlot = null;
        _simDetectionComplete = true;
        _simPermissionDenied = true;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _simMap = const {'mtn': null, 'telecel': null, 'at_money': null};
        _simCards = const [];
        _selectedSimSlot = null;
        _simDetectionComplete = true;
        _simPermissionDenied = false;
      });
    }
  }

  void _scheduleFlowPreload({bool immediate = false}) {
    _flowPreloadDebounce?.cancel();

    if (immediate) {
      unawaited(_preloadSelectedFlow());
      return;
    }

    _flowPreloadDebounce = Timer(
      const Duration(milliseconds: 180),
      () => unawaited(_preloadSelectedFlow()),
    );
  }

  Future<void> _preloadSelectedFlow() async {
    final provider = _selectedProvider;
    final transactionType = widget.transactionType;
    final cacheKey = '$provider:$transactionType';
    final identity = _offlineIdentity;

    if (identity == null) return;

    // The progress screen can already start immediately when this
    // definition is present, so no network refresh is needed here.
    if (OfflineQueueService.getCachedFlow(
          provider,
          transactionType,
          identity: identity,
          isPersonal: false,
        ) !=
        null) {
      return;
    }

    // Avoid repeating a failed or successful warm-up request while this
    // Transaction screen remains open.
    if (!_flowPreloadAttempts.add(cacheKey)) {
      return;
    }

    try {
      final response = await ApiClient.instance.get(
        '/ussd-flows/resolve',
        queryParameters: {
          'provider': provider,
          'transaction_type': transactionType,
          'mode': 'business',
        },
      );

      final rawFlow = response.data['data'];
      if (rawFlow is! Map) return;

      await OfflineQueueService.cacheFlow(
        provider,
        transactionType,
        Map<String, dynamic>.from(rawFlow),
        identity: identity,
        isPersonal: false,
      );
    } catch (_) {
      // Some combinations use hardcoded automation or have no custom
      // flow. Preloading must never interrupt form entry or submission.
    }
  }

  void _selectProvider(String provider) {
    if (_providerLocked) {
      return;
    }

    if (!_providerSupportsTransaction(provider)) {
      return;
    }

    if (provider == _selectedProvider) {
      return;
    }

    setState(() {
      _selectedProvider = provider;
      _selectedTelecelBundle = null;

      final providerSims = _simCards
          .where((sim) => sim.network == provider)
          .toList()
        ..sort((a, b) => a.slot.compareTo(b.slot));

      _selectedSimSlot = providerSims.isEmpty ? null : providerSims.first.slot;

      if (provider != 'telecel' || widget.transactionType != 'data_bundle') {
        return;
      }

      _amountCtrl.clear();
    });

    _scheduleFlowPreload();
  }

  Future<void> _proceed() async {
    if (!_formKey.currentState!.validate()) return;

    if (!_simDetectionComplete) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('SIM detection is still in progress.')),
      );
      return;
    }

    if (_selectedSim == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _simPermissionDenied
                ? 'Allow phone permission before starting this transaction.'
                : _providerLocked
                    ? 'The $_selectedProviderLabel SIM selected for this transaction is required.'
                    : 'No supported SIM is available for this transaction.',
          ),
        ),
      );
      return;
    }

    if (_isTelecelDataBundle && _selectedTelecelBundle == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select a Telecel data bundle')),
      );
      return;
    }

    if (_isManualCashOut) {
      await _submitManualCashOut();
      return;
    }

    String installationId;
    try {
      installationId = await StorageService.getOrCreateInstallationId();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'AgentPro could not establish this device identity. Please try again.',
          ),
        ),
      );
      return;
    }

    // Stable identity for this exact financial attempt. Retries and offline
    // synchronization must keep this same value so the backend cannot create
    // a duplicate transaction after an ambiguous network failure.
    final clientOperationId = const Uuid().v4();

    setState(() => _loading = true);

    // Offline path: only for provider+type combos that already have a
    // cached USSD template from a prior successful online run. If
    // offline with no cached template yet, fall through to the normal
    // online attempt below, which will fail with a clear network error -
    // this combo needs to succeed online at least once before it can
    // work offline.
    final connectivity = await Connectivity().checkConnectivity();
    final isOffline = connectivity.every(
      (result) => result == ConnectivityResult.none,
    );

    if (isOffline) {
      final trust = await StorageService.evaluateOfflineTransactionTrust(
        isPersonal: false,
      );

      if (!trust.isValid) {
        if (!mounted) return;

        setState(() => _loading = false);

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Offline transaction access needs a fresh server '
              'verification. Connect to the internet, open AgentPro, '
              'then try again.',
            ),
          ),
        );

        return;
      }
    }

    final identity = _offlineIdentity;

    final cachedTemplate = identity == null
        ? null
        : OfflineQueueService.getCachedTemplate(
            _selectedProvider,
            widget.transactionType,
            identity: identity,
          );

    final cachedFlow = identity == null
        ? null
        : OfflineQueueService.getCachedFlow(
            _selectedProvider,
            widget.transactionType,
            identity: identity,
            isPersonal: false,
          );

    // MTN Cash In/Out/Send Money and Telecel Deposit never need a
    // cached template - their dial code and menu steps are hardcoded
    // in the accessibility service, not fetched from the backend, so
    // ussd_template is null for them even after a successful online
    // run. Gating these on cachedTemplate != null would mean they can
    // never go offline at all. Only the custom Flow Builder path
    // genuinely needs a prior online run to learn its dial code.
    final isAccessibilityHardcodedFlow = (_selectedProvider == 'mtn' &&
            (widget.transactionType == 'cash_in' ||
                widget.transactionType == 'cash_out' ||
                widget.transactionType == 'send_money')) ||
        (_selectedProvider == 'telecel' && widget.transactionType == 'cash_in');

    if (isOffline &&
        (isAccessibilityHardcodedFlow ||
            cachedTemplate != null ||
            cachedFlow != null)) {
      final localId = 'local_${DateTime.now().millisecondsSinceEpoch}';
      final requestFields = {
        'provider': _selectedProvider,
        'transaction_type': widget.transactionType,
        'amount': double.tryParse(_amountCtrl.text.replaceAll(',', '')) ?? 0,
        'customer_phone': _customerPhoneCtrl.text.trim(),
        'customer_name': '',
        'recipient_phone': _recipientPhoneCtrl.text.trim(),
        'biller_code': '',
        'account_number': '',
        'payment_reference': _referenceCtrl.text.trim(),
        'merchant_id': _merchantIdCtrl.text.trim(),
        'fee': _isTransferChargeFlow
            ? (double.tryParse(_feeCtrl.text.replaceAll(',', '')) ?? 0)
            : 0,
        'notes': '',
        'sim_iccid': _selectedSim?.iccid ?? '',
        'sim_slot': _selectedSim?.slot,
        'installation_id': installationId,
        'sim_subscription_id': _selectedSim?.subscriptionId,
        'client_operation_id': clientOperationId,
      };

      if (!mounted) return;
      final progressAction = await context.push<String>(
        '/transactions/progress',
        extra: {
          'transaction': {
            'transaction_id': localId,
            'reference': 'OFFLINE-$localId',
            'status': 'initiated',
            'ussd_template': cachedTemplate,
            'automation_params': requestFields,
            'cached_flow': cachedFlow,
          },
          'provider': _selectedProvider,
          'transaction_type': widget.transactionType,
          'amount': _amountCtrl.text,
          'customer_phone': _customerPhoneCtrl.text.trim(),
          'customer_name': '',
          'sim_slot': _selectedSim?.slot,
          'sim_iccid': _selectedSim?.iccid,
          'sim_subscription_id': _selectedSim?.subscriptionId,
          'selections_in_order':
              _isTelecelDataBundle && _selectedTelecelBundle != null
                  ? <String>[_selectedTelecelBundle!.digit]
                  : const <String>[],
          'request_fields': requestFields,
        },
      );
      if (mounted) setState(() => _loading = false);

      if (mounted && progressAction == 'retry_now') {
        await _proceed();
      }
      return;
    }

    final requestFields = <String, dynamic>{
      'provider': _selectedProvider,
      'transaction_type': widget.transactionType,
      'amount': double.tryParse(_amountCtrl.text.replaceAll(',', '')) ?? 0,
      'customer_phone': _customerPhoneCtrl.text.trim(),
      'customer_name': '',
      'recipient_phone': _recipientPhoneCtrl.text.trim(),
      'biller_code': '',
      'account_number': '',
      'payment_reference': _referenceCtrl.text.trim(),
      'merchant_id': _merchantIdCtrl.text.trim(),
      'fee': _isTransferChargeFlow
          ? (double.tryParse(_feeCtrl.text.replaceAll(',', '')) ?? 0)
          : 0,
      'notes': '',
      'sim_iccid': _selectedSim?.iccid ?? '',
      'sim_slot': _selectedSim?.slot,
      'installation_id': installationId,
      'sim_subscription_id': _selectedSim?.subscriptionId,
      'client_operation_id': clientOperationId,
    };

    // Start backend validation/creation now, but do not wait on this
    // form screen. TransactionProgressScreen prepares permission and
    // SIM information in parallel, then waits for this Future before
    // it is allowed to dial.
    final transactionFuture = _initiateOnlineTransaction(
      requestFields: requestFields,
      provider: _selectedProvider,
      transactionType: widget.transactionType,
    );

    if (!mounted) return;

    final progressAction = await context.push<String>(
      '/transactions/progress',
      extra: {
        'transaction_future': transactionFuture,
        'provider': _selectedProvider,
        'transaction_type': widget.transactionType,
        'amount': _amountCtrl.text,
        'customer_phone': _customerPhoneCtrl.text.trim(),
        'customer_name': '',
        'sim_slot': _selectedSim?.slot,
        'sim_iccid': _selectedSim?.iccid,
        'sim_subscription_id': _selectedSim?.subscriptionId,
        'selections_in_order':
            _isTelecelDataBundle && _selectedTelecelBundle != null
                ? <String>[_selectedTelecelBundle!.digit]
                : const <String>[],
        'request_fields': requestFields,
      },
    );

    if (mounted) {
      setState(() => _loading = false);
    }

    if (mounted && progressAction == 'retry_now') {
      await _proceed();
    }
  }

  Future<Map<String, dynamic>> _initiateOnlineTransaction({
    required Map<String, dynamic> requestFields,
    required String provider,
    required String transactionType,
  }) async {
    final response = await ApiClient.instance.post(
      '/transactions',
      data: requestFields,
    );

    final rawTransaction = response.data['data'];

    if (rawTransaction is! Map) {
      throw const FormatException('Invalid transaction initiation response');
    }

    final transaction = Map<String, dynamic>.from(rawTransaction);
    final rawTemplate = transaction['ussd_template'];
    final template =
        rawTemplate is Map ? Map<String, dynamic>.from(rawTemplate) : null;

    unawaited(
      _cacheTransactionAutomationData(
        provider: provider,
        transactionType: transactionType,
        template: template,
      ),
    );

    return transaction;
  }

  Future<void> _cacheTransactionAutomationData({
    required String provider,
    required String transactionType,
    Map<String, dynamic>? template,
  }) async {
    final identity = _offlineIdentity;
    if (identity == null) return;

    if (template != null) {
      try {
        await OfflineQueueService.cacheTemplate(
          provider,
          transactionType,
          template,
          identity: identity,
        );
      } catch (_) {
        // Caching must never delay or fail the live transaction.
      }
    }

    try {
      final flowRes = await ApiClient.instance.get(
        '/ussd-flows/resolve',
        queryParameters: {
          'provider': provider,
          'transaction_type': transactionType,
          'mode': 'business',
        },
      );

      final rawData = flowRes.data['data'];
      if (rawData is! Map) return;

      await OfflineQueueService.cacheFlow(
        provider,
        transactionType,
        Map<String, dynamic>.from(rawData),
        identity: identity,
        isPersonal: false,
      );
    } catch (_) {
      // No custom flow, no network, or cache failure. The active
      // transaction continues through the progress screen normally.
    }
  }

  bool _isRetryableManualCashOutError(DioException error) {
    final statusCode = error.response?.statusCode;

    // No HTTP response is ambiguous: the backend may already have committed
    // the transaction and both balance movements before the response was lost.
    return error.response == null ||
        statusCode == 408 ||
        statusCode == 429 ||
        (statusCode != null && statusCode >= 500);
  }

  Future<void> _submitManualCashOut() async {
    final amount = double.tryParse(_amountCtrl.text.replaceAll(',', ''));

    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter the cash amount given to the customer'),
        ),
      );
      return;
    }

    final selectedSim = _selectedSim;

    if (selectedSim == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Select the physical SIM used for this Cash Out'),
        ),
      );
      return;
    }

    final devicePreparation = await TransactionDevicePreparationService.prepare(
      provider: _selectedProvider,
      requestedSimSlot: selectedSim.slot,
      requestedSimIccid: selectedSim.iccid,
      requestedSimSubscriptionId: selectedSim.subscriptionId,
    );

    if (!devicePreparation.isReady) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            devicePreparation.failureReason ??
                'AgentPro could not verify the selected SIM.',
          ),
        ),
      );
      return;
    }

    String installationId;
    try {
      installationId = await StorageService.getOrCreateInstallationId();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'AgentPro could not establish this device identity. Please try again.',
          ),
        ),
      );
      return;
    }

    final customerReference = _customerPhoneCtrl.text.trim();

    final simIdentity = selectedSim.iccid.trim().isNotEmpty
        ? 'iccid:${selectedSim.iccid.trim()}|slot:${selectedSim.slot}'
        : 'fallback:$installationId:${selectedSim.subscriptionId}:${selectedSim.slot}';

    final fingerprint = [
      _selectedProvider,
      amount.toStringAsFixed(2),
      customerReference,
      simIdentity,
    ].join('|');

    final canReuseOperation = _pendingManualCashOutOperationId != null &&
        _pendingManualCashOutFingerprint == fingerprint;

    final clientOperationId = canReuseOperation
        ? _pendingManualCashOutOperationId!
        : const Uuid().v4();

    _pendingManualCashOutOperationId = clientOperationId;
    _pendingManualCashOutFingerprint = fingerprint;

    setState(() => _loading = true);

    try {
      await ApiClient.instance.post(
        '/balances/cash-out-manual',
        data: {
          'provider': _selectedProvider,
          'amount': amount,
          'reference': customerReference,
          'notes': 'Manual Cash Out',
          'sim_iccid': selectedSim.iccid,
          'sim_slot': selectedSim.slot,
          'installation_id': installationId,
          'sim_subscription_id': selectedSim.subscriptionId,
          'client_operation_id': clientOperationId,
        },
      );

      // Backend has definitively resolved this operation. Any later Cash Out
      // must receive a new financial operation ID.
      _pendingManualCashOutOperationId = null;
      _pendingManualCashOutFingerprint = null;

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Cash Out recorded successfully')),
        );
        context.pop();
      }
    } on DioException catch (error) {
      final responseData = error.response?.data;
      final serverMessage =
          responseData is Map ? responseData['message']?.toString() : null;

      final retryable = _isRetryableManualCashOutError(error);

      if (!retryable) {
        // A definite HTTP rejection means the backend did not leave an
        // ambiguous operation that needs the same UUID.
        _pendingManualCashOutOperationId = null;
        _pendingManualCashOutFingerprint = null;
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              serverMessage ??
                  (retryable
                      ? 'Connection problem while recording Cash Out. Tap again to safely retry the same operation.'
                      : 'Failed to record Cash Out'),
            ),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    } catch (_) {
      // Preserve the UUID after an unexpected client-side failure because
      // the server may already have committed the financial event.
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Cash Out could not be confirmed. Tap again to safely retry the same operation.',
            ),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_title),
        actions: [
          TextButton.icon(
            onPressed: () => context.pop(),
            icon: const Icon(Icons.arrow_back),
            label: const Text('Return'),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // SIM-aware network selection.
              //
              // When a transaction is launched from a provider/SIM context,
              // keep that provider locked for the entire transaction. The
              // exact physical SIM remains visible, and same-provider dual-SIM
              // users may explicitly choose another SIM from that provider.
              if (_providerLocked) ...[
                if (!_simDetectionComplete) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          'Detecting $_selectedProviderLabel SIMs…',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ] else if (_selectedProviderSims.isEmpty) ...[
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: context.appSurface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.appDivider),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.sim_card_alert_outlined,
                          color: context.appSecondaryText,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _simPermissionDenied
                                ? 'Allow phone permission to detect your $_selectedProviderLabel SIM.'
                                : 'Insert a $_selectedProviderLabel SIM to continue.',
                            style: TextStyle(
                              color: context.appSecondaryText,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                ] else if (_selectedSim == null) ...[
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: context.appSurface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.appDivider),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.sim_card_alert_outlined,
                          color: context.appSecondaryText,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'The selected physical SIM is no longer available. '
                            'Select another SIM explicitly to continue.',
                            style: TextStyle(
                              color: context.appSecondaryText,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_selectedProviderSims.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Select physical SIM',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _selectedProviderSims.map((sim) {
                        final color = AppTheme.providerColor(_selectedProvider);

                        return ChoiceChip(
                          selected: false,
                          onSelected: (_) {
                            setState(() {
                              _selectedSimSlot = sim.slot;
                              _initialSimIdentityUnavailable = false;
                            });
                          },
                          selectedColor: color.withValues(alpha: 0.16),
                          avatar: Icon(
                            Icons.sim_card_outlined,
                            size: 18,
                            color: context.appSecondaryText,
                          ),
                          label: Text(
                            'SIM ${sim.slot + 1}'
                            '${sim.iccid.isNotEmpty ? ' · ${sim.iccid.substring(sim.iccid.length > 6 ? sim.iccid.length - 6 : 0)}' : ''}',
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                  const SizedBox(height: 20),
                ] else ...[
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: context.appSurface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.appDivider),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.sim_card_outlined,
                          color: AppTheme.providerColor(_selectedProvider),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            '$_selectedProviderLabel locked · Using SIM ${_selectedSim!.slot + 1}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        const Icon(Icons.lock_outline, size: 18),
                      ],
                    ),
                  ),
                  if (_selectedProviderSims.length > 1) ...[
                    const SizedBox(height: 14),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Select physical $_selectedProviderLabel SIM',
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _selectedProviderSims.map((sim) {
                        final selected = _selectedSim?.slot == sim.slot;
                        final color = AppTheme.providerColor(_selectedProvider);

                        return ChoiceChip(
                          selected: selected,
                          onSelected: (_) {
                            setState(() {
                              _selectedSimSlot = sim.slot;
                              _initialSimIdentityUnavailable = false;
                            });
                          },
                          selectedColor: color.withValues(alpha: 0.16),
                          avatar: Icon(
                            Icons.sim_card_outlined,
                            size: 18,
                            color: selected ? color : context.appSecondaryText,
                          ),
                          label: Text(
                            'SIM ${sim.slot + 1}'
                            '${sim.iccid.isNotEmpty ? ' · ${sim.iccid.substring(sim.iccid.length > 6 ? sim.iccid.length - 6 : 0)}' : ''}',
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                  const SizedBox(height: 20),
                ],
              ] else ...[
                if (!_simDetectionComplete) ...[
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        SizedBox(width: 10),
                        Text(
                          'Detecting SIMs…',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ] else if (_availableProviders.isEmpty) ...[
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: context.appSurface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.appDivider),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.sim_card_alert_outlined,
                          color: context.appSecondaryText,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _simPermissionDenied
                                ? 'Allow phone permission to detect your SIM cards.'
                                : widget.transactionType == 'data_bundle'
                                    ? 'Insert an MTN or Telecel SIM to continue.'
                                    : 'Insert an MTN, Telecel or AT Money SIM to continue.',
                            style: TextStyle(
                              color: context.appSecondaryText,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                ] else if (_selectedSim == null) ...[
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: context.appSurface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.appDivider),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.sim_card_alert_outlined,
                          color: context.appSecondaryText,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'The selected physical SIM is no longer available. '
                            'Select another SIM explicitly to continue.',
                            style: TextStyle(
                              color: context.appSecondaryText,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_selectedProviderSims.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Select physical SIM',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _selectedProviderSims.map((sim) {
                        final color = AppTheme.providerColor(_selectedProvider);

                        return ChoiceChip(
                          selected: false,
                          onSelected: (_) {
                            setState(() {
                              _selectedSimSlot = sim.slot;
                              _initialSimIdentityUnavailable = false;
                            });
                          },
                          selectedColor: color.withValues(alpha: 0.16),
                          avatar: Icon(
                            Icons.sim_card_outlined,
                            size: 18,
                            color: context.appSecondaryText,
                          ),
                          label: Text(
                            'SIM ${sim.slot + 1}'
                            '${sim.iccid.isNotEmpty ? ' · ${sim.iccid.substring(sim.iccid.length > 6 ? sim.iccid.length - 6 : 0)}' : ''}',
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                  const SizedBox(height: 20),
                ] else if (_availableProviders.length == 1) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: context.appSurface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.appDivider),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.sim_card_outlined,
                          color: AppTheme.providerColor(_selectedProvider),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Using ${{
                              'mtn': 'MTN',
                              'telecel': 'Telecel',
                              'at_money': 'AT Money'
                            }[_selectedProvider]} SIM ${_selectedSim!.slot + 1}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        const Icon(Icons.check_circle_outline, size: 18),
                      ],
                    ),
                  ),
                  if (_selectedProviderSims.length > 1) ...[
                    const SizedBox(height: 14),
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Select physical SIM',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _selectedProviderSims.map((sim) {
                        final selected = _selectedSim?.slot == sim.slot;
                        final color = AppTheme.providerColor(_selectedProvider);

                        return ChoiceChip(
                          selected: selected,
                          onSelected: (_) {
                            setState(() {
                              _selectedSimSlot = sim.slot;
                              _initialSimIdentityUnavailable = false;
                            });
                          },
                          selectedColor: color.withValues(alpha: 0.16),
                          avatar: Icon(
                            Icons.sim_card_outlined,
                            size: 18,
                            color: selected ? color : context.appSecondaryText,
                          ),
                          label: Text(
                            'SIM ${sim.slot + 1}'
                            '${sim.iccid.isNotEmpty ? ' · ${sim.iccid.substring(sim.iccid.length > 6 ? sim.iccid.length - 6 : 0)}' : ''}',
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 20),
                  ],
                  const SizedBox(height: 20),
                ] else ...[
                  const Text(
                    'Using SIM',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: _availableProviders.map((provider) {
                      final selected = _selectedProvider == provider;
                      final color = AppTheme.providerColor(provider);
                      final sim = _simMap![provider]!;
                      final label = {
                        'mtn': 'MTN',
                        'telecel': 'Telecel',
                        'at_money': 'AT Money',
                      }[provider]!;

                      return Expanded(
                        child: GestureDetector(
                          onTap: () => _selectProvider(provider),
                          child: Container(
                            margin: const EdgeInsets.only(right: 8),
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            decoration: BoxDecoration(
                              color: selected ? color : context.appSurface,
                              border: Border.all(
                                color: selected ? color : context.appDivider,
                              ),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Column(
                              children: [
                                Icon(
                                  Icons.sim_card_outlined,
                                  color: selected
                                      ? (provider == 'mtn'
                                          ? Colors.black
                                          : Colors.white)
                                      : color,
                                  size: 20,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '$label SIM ${sim.slot + 1}',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                    color: selected
                                        ? (provider == 'mtn'
                                            ? Colors.black
                                            : Colors.white)
                                        : context.appSecondaryText,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  if (_selectedProviderSims.length > 1) ...[
                    const SizedBox(height: 14),
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Select physical SIM',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _selectedProviderSims.map((sim) {
                        final selected = _selectedSim?.slot == sim.slot;
                        final color = AppTheme.providerColor(_selectedProvider);

                        return ChoiceChip(
                          selected: selected,
                          onSelected: (_) {
                            setState(() {
                              _selectedSimSlot = sim.slot;
                              _initialSimIdentityUnavailable = false;
                            });
                          },
                          selectedColor: color.withValues(alpha: 0.16),
                          avatar: Icon(
                            Icons.sim_card_outlined,
                            size: 18,
                            color: selected ? color : context.appSecondaryText,
                          ),
                          label: Text(
                            'SIM ${sim.slot + 1}'
                            '${sim.iccid.isNotEmpty ? ' · ${sim.iccid.substring(sim.iccid.length > 6 ? sim.iccid.length - 6 : 0)}' : ''}',
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                  const SizedBox(height: 20),
                ],
              ],

              // Provider-specific identifier.
              //
              // Pay to Merchant uses a Merchant ID rather than a phone
              // number. Keep that identifier truthful instead of presenting
              // it as a phone field.
              if (_needsMerchantId) ...[
                AppTextField(
                  controller: _merchantIdCtrl,
                  label: 'Merchant ID',
                  prefixIcon: Icons.storefront_outlined,
                  validator: (v) =>
                      v!.isEmpty ? 'Merchant ID is required' : null,
                ),
                const SizedBox(height: 14),
              ],

              // Telecel Agent Data Bundle is selected from the provider
              // bundle menu and therefore has its own specialized control.
              if (_isTelecelDataBundle) ...[
                DropdownButtonFormField<AgentTelecelBundleOption>(
                  initialValue: _selectedTelecelBundle,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Select Data Bundle',
                    prefixIcon: Icon(Icons.data_usage_outlined),
                    border: OutlineInputBorder(),
                  ),
                  items: kAgentTelecelBundles
                      .map(
                        (bundle) => DropdownMenuItem(
                          value: bundle,
                          child: Text(
                            bundle.label,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (bundle) {
                    setState(() {
                      _selectedTelecelBundle = bundle;
                      _amountCtrl.text =
                          bundle?.amount.toStringAsFixed(2) ?? '';
                    });
                  },
                  validator: (bundle) =>
                      bundle == null ? 'Select a data bundle' : null,
                ),
                const SizedBox(height: 14),
              ],

              // 1. PHONE NUMBER
              //
              // Business Deposit / Withdrawal genuinely use an Agent Short
              // Code, so retain that terminology for those specific flows.
              if (_needsCustomer) ...[
                AppTextField(
                  controller: _customerPhoneCtrl,
                  label: [
                    'business_deposit',
                    'business_withdrawal',
                  ].contains(widget.transactionType)
                      ? 'Agent Short Code'
                      : 'Phone Number',
                  hint: [
                    'business_deposit',
                    'business_withdrawal',
                  ].contains(widget.transactionType)
                      ? 'Enter agent short code'
                      : '024XXXXXXX',
                  keyboardType: TextInputType.phone,
                  prefixIcon: Icons.phone_outlined,
                  validator: (v) {
                    if (v == null || v.isEmpty) {
                      return [
                        'business_deposit',
                        'business_withdrawal',
                      ].contains(widget.transactionType)
                          ? 'Agent short code is required'
                          : 'Phone number is required';
                    }

                    return null;
                  },
                ),
                const SizedBox(height: 14),
              ],

              if (_needsRecipient) ...[
                AppTextField(
                  controller: _recipientPhoneCtrl,
                  label: 'Phone Number',
                  hint: '024XXXXXXX',
                  keyboardType: TextInputType.phone,
                  prefixIcon: Icons.phone_outlined,
                  validator: (v) => v == null || v.isEmpty
                      ? 'Phone number is required'
                      : null,
                ),
                const SizedBox(height: 14),
              ],

              // 2. AMOUNT
              if (_needsAmount) ...[
                TextFormField(
                  controller: _amountCtrl,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(
                      RegExp(r'[0-9.]'),
                    ),
                  ],
                  decoration: InputDecoration(
                    labelText: 'Amount (GH₵)',
                    hintText: '0.00',
                    prefixIcon: const Icon(Icons.monetization_on_outlined),
                    prefixText: 'GH₵  ',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    filled: true,
                    fillColor: context.appSurface,
                  ),
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                  validator: (v) {
                    if (v == null || v.isEmpty) {
                      return 'Amount is required';
                    }

                    final n = double.tryParse(v);

                    if (n == null || n <= 0) {
                      return 'Enter a valid amount';
                    }

                    return null;
                  },
                ),
                const SizedBox(height: 14),
              ],

              // 3. REFERENCE — only when required by the provider flow.
              if (_needsReference) ...[
                AppTextField(
                  controller: _referenceCtrl,
                  label: 'Reference',
                  prefixIcon: Icons.notes_outlined,
                  validator: (v) =>
                      v == null || v.isEmpty ? 'Reference is required' : null,
                ),
                const SizedBox(height: 14),
              ],

              // 4. TRANSFER CHARGES — only when AgentPro records a
              // provider transfer charge for this transaction.
              if (_isTransferChargeFlow) ...[
                TextFormField(
                  controller: _feeCtrl,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(
                      RegExp(r'[0-9.]'),
                    ),
                  ],
                  decoration: InputDecoration(
                    labelText: 'Transfer Charges (GH₵)',
                    hintText: '0.00',
                    prefixIcon: const Icon(Icons.receipt_long_outlined),
                    prefixText: 'GH₵  ',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    filled: true,
                    fillColor: context.appSurface,
                    helperText:
                        'Defaults to 1% • edit if the actual charge differs',
                  ),
                  onChanged: (_) => _feeAutoCalculated = false,
                  validator: (v) {
                    if (v == null || v.isEmpty) {
                      return null;
                    }

                    final n = double.tryParse(v);

                    if (n == null || n < 0) {
                      return 'Enter a valid charge';
                    }

                    return null;
                  },
                ),
                const SizedBox(height: 14),
              ],

              const SizedBox(height: 10),

              // Security/info notice - content depends on whether this is
              // a real USSD dial (PIN entered on the network's own screen)
              // or a manual Telecel/AT Cash Out record (no dial, no PIN,
              // ever - showing the PIN notice here would be actively wrong).
              if (_isManualCashOut)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.isDarkMode
                        ? const Color(0xFF3D2E1A)
                        : Colors.orange[50],
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: context.isDarkMode
                          ? const Color(0xFF8F6A3A)
                          : Colors.orange[200]!,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.info_outline,
                        color: context.isDarkMode
                            ? Colors.orange[200]
                            : Colors.orange,
                        size: 18,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'No dialing needed. The customer already sent this amount directly to your line. Confirm the details, then hand over the equivalent cash.',
                          style: TextStyle(
                            fontSize: 12,
                            color: context.isDarkMode
                                ? Colors.orange[200]
                                : Colors.orange[900],
                          ),
                        ),
                      ),
                    ],
                  ),
                )
              else
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.isDarkMode
                        ? Colors.blue[900]!.withValues(alpha: 0.25)
                        : Colors.blue[50],
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: context.isDarkMode
                          ? Colors.blue[700]!
                          : Colors.blue[200]!,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.security,
                        color:
                            context.isDarkMode ? Colors.blue[200] : Colors.blue,
                        size: 18,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'You will enter your MoMo PIN only on the official network USSD screen. '
                          'Agent Pro Ghana never asks for your PIN.',
                          style: TextStyle(
                            fontSize: 12,
                            color: context.isDarkMode
                                ? Colors.blue[200]
                                : Colors.blue[900],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

              const SizedBox(height: 24),

              AppButton(
                label: _isManualCashOut
                    ? 'Record Cash Out'
                    : 'Proceed to ${_needsAmount ? 'Confirm' : 'Execute'}',
                onPressed: _proceed,
                isLoading: _loading,
                icon: Icons.arrow_forward,
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _flowPreloadDebounce?.cancel();

    for (final c in [
      _customerPhoneCtrl,
      _amountCtrl,
      _recipientPhoneCtrl,
      _referenceCtrl,
      _merchantIdCtrl,
      _feeCtrl,
    ]) {
      c.dispose();
    }
    super.dispose();
  }
}
