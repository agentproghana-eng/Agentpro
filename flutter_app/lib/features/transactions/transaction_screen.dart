import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/utils/transaction_labels.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../../core/services/offline_queue_service.dart';
import '../../core/services/sim_card_service.dart';

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
  const TransactionScreen({
    super.key,
    required this.transactionType,
    this.initialProvider,
  });

  @override
  State<TransactionScreen> createState() => _TransactionScreenState();
}

class _TransactionScreenState extends State<TransactionScreen> {
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
  bool _simDetectionComplete = false;
  bool _simPermissionDenied = false;
  AgentTelecelBundleOption? _selectedTelecelBundle;

  Timer? _flowPreloadDebounce;
  final Set<String> _flowPreloadAttempts = {};

  @override
  void initState() {
    super.initState();

    if (widget.initialProvider != null) {
      _selectedProvider = widget.initialProvider!;
    }
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
      if (!_isSendMoney || !_feeAutoCalculated) return;
      final amount = double.tryParse(_amountCtrl.text.replaceAll(',', '')) ?? 0;
      final fee = amount * 0.01;
      _feeCtrl.text = fee > 0 ? fee.toStringAsFixed(2) : '';
    });
  }

  String get _title =>
      transactionTypeLabel(widget.transactionType, _selectedProvider);

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

  bool get _needsAmount =>
      ![
        'balance_enquiry',
        'mini_statement',
        'commission_balance',
        'cash_in_commission',
      ].contains(widget.transactionType) &&
      !_isTelecelDataBundle;
  // Send Money only needs the recipient's number, and Pay to Merchant
  // only needs a Merchant ID - neither has a separate walk-in customer
  // phone field, unlike Cash In/Cash Out/Pay to Agent, where the agent
  // is entering a real person's phone in front of them.
  bool get _needsCustomer => ![
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
  bool get _isSendMoney => widget.transactionType == 'send_money';

  // Telecel/AirtelTigo Cash Out: e-cash moves directly SIM-to-SIM,
  // invisible to USSD automation. No dial happens at all for this
  // combo - it's recorded manually instead. Promoted to a getter (not
  // just a local var in _proceed()) so the UI can also reflect this -
  // showing the actual PIN/USSD security notice here would be actively
  // wrong, since no PIN entry or dialing ever happens in this flow.
  bool get _isManualCashOut =>
      widget.transactionType == "cash_out" &&
      (_selectedProvider == "telecel" || _selectedProvider == "at_money");

  List<String> get _availableProviders {
    if (!_simDetectionComplete || _simMap == null) {
      return const <String>[];
    }

    return _simMap!.entries
        .where((entry) => entry.value != null)
        .map((entry) => entry.key)
        .toList();
  }

  SimCard? get _selectedSim => _simMap?[_selectedProvider];

  Future<void> _loadSimMap() async {
    if (mounted) {
      setState(() {
        _simDetectionComplete = false;
        _simPermissionDenied = false;
      });
    }

    try {
      var map = await SimCardService.getNetworkSimMap();

      if (map.values.every((sim) => sim == null)) {
        await Future.delayed(const Duration(milliseconds: 1200));

        if (!mounted) return;

        map = await SimCardService.getNetworkSimMap();
      }

      if (!mounted) return;

      final available = map.entries
          .where((entry) => entry.value != null)
          .map((entry) => entry.key)
          .toList();

      var providerChanged = false;

      setState(() {
        _simMap = map;
        _simDetectionComplete = true;
        _simPermissionDenied = false;

        if (!_needsReference &&
            available.isNotEmpty &&
            !available.contains(_selectedProvider)) {
          providerChanged = true;
          _selectedProvider = available.first;
          _selectedTelecelBundle = null;
        }
      });

      if (providerChanged) {
        _scheduleFlowPreload();
      }
    } on SimPermissionException {
      if (!mounted) return;

      setState(() {
        _simMap = const {
          'mtn': null,
          'telecel': null,
          'at_money': null,
        };
        _simDetectionComplete = true;
        _simPermissionDenied = true;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _simMap = const {
          'mtn': null,
          'telecel': null,
          'at_money': null,
        };
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

    // The progress screen can already start immediately when this
    // definition is present, so no network refresh is needed here.
    if (OfflineQueueService.getCachedFlow(provider, transactionType) != null) {
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
        },
      );

      final rawFlow = response.data['data'];
      if (rawFlow is! Map) return;

      await OfflineQueueService.cacheFlow(
        provider,
        transactionType,
        Map<String, dynamic>.from(rawFlow),
      );
    } catch (_) {
      // Some combinations use hardcoded automation or have no custom
      // flow. Preloading must never interrupt form entry or submission.
    }
  }

  void _selectProvider(String provider) {
    if (provider == _selectedProvider) {
      return;
    }

    setState(() {
      _selectedProvider = provider;
      _selectedTelecelBundle = null;

      if (provider != 'telecel' || widget.transactionType != 'data_bundle') {
        return;
      }

      _amountCtrl.clear();
    });

    _scheduleFlowPreload();
  }

  Future<void> _proceed() async {
    if (!_formKey.currentState!.validate()) return;

    if (!_needsReference) {
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
                  : 'No supported SIM is available for this transaction.',
            ),
          ),
        );
        return;
      }
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

    setState(() => _loading = true);

    // Offline path: only for provider+type combos that already have a
    // cached USSD template from a prior successful online run. If
    // offline with no cached template yet, fall through to the normal
    // online attempt below, which will fail with a clear network error -
    // this combo needs to succeed online at least once before it can
    // work offline.
    final connectivity = await Connectivity().checkConnectivity();
    final isOffline = connectivity.every((r) => r == ConnectivityResult.none);
    final cachedTemplate = OfflineQueueService.getCachedTemplate(
      _selectedProvider,
      widget.transactionType,
    );
    final cachedFlow = OfflineQueueService.getCachedFlow(
      _selectedProvider,
      widget.transactionType,
    );

    // MTN Cash In/Out/Send Money and Telecel Deposit never need a
    // cached template - their dial code and menu steps are hardcoded
    // in the accessibility service, not fetched from the backend, so
    // ussd_template is null for them even after a successful online
    // run. Gating these on cachedTemplate != null would mean they can
    // never go offline at all. Only the custom Flow Builder path
    // genuinely needs a prior online run to learn its dial code.
    final isAccessibilityHardcodedFlow = (_selectedProvider == "mtn" &&
            (widget.transactionType == "cash_in" ||
                widget.transactionType == "cash_out" ||
                widget.transactionType == "send_money")) ||
        (_selectedProvider == "telecel" && widget.transactionType == "cash_in");

    if (isOffline &&
        (isAccessibilityHardcodedFlow ||
            cachedTemplate != null ||
            cachedFlow != null)) {
      final localId = "local_${DateTime.now().millisecondsSinceEpoch}";
      final requestFields = {
        "provider": _selectedProvider,
        "transaction_type": widget.transactionType,
        "amount": double.tryParse(_amountCtrl.text.replaceAll(",", "")) ?? 0,
        "customer_phone": _customerPhoneCtrl.text.trim(),
        "customer_name": "",
        "recipient_phone": _recipientPhoneCtrl.text.trim(),
        "biller_code": "",
        "account_number": "",
        "payment_reference": _referenceCtrl.text.trim(),
        "merchant_id": _merchantIdCtrl.text.trim(),
        "fee": _isSendMoney
            ? (double.tryParse(_feeCtrl.text.replaceAll(",", "")) ?? 0)
            : 0,
        "notes": "",
        "sim_iccid": _simMap?[_selectedProvider]?.iccid ?? "",
        "sim_slot": _simMap?[_selectedProvider]?.slot,
      };

      if (!mounted) return;
      context.push(
        "/transactions/progress",
        extra: {
          "transaction": {
            "transaction_id": localId,
            "reference": "OFFLINE-$localId",
            "status": "initiated",
            "ussd_template": cachedTemplate,
            "automation_params": requestFields,
            "cached_flow": cachedFlow,
          },
          "provider": _selectedProvider,
          "transaction_type": widget.transactionType,
          "amount": _amountCtrl.text,
          "customer_phone": _customerPhoneCtrl.text.trim(),
          "customer_name": "",
          "sim_slot": _selectedSim?.slot,
          "sim_iccid": _selectedSim?.iccid,
          "selections_in_order":
              _isTelecelDataBundle && _selectedTelecelBundle != null
                  ? <String>[_selectedTelecelBundle!.digit]
                  : const <String>[],
          "request_fields": requestFields,
        },
      );
      if (mounted) setState(() => _loading = false);
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
      'fee': _isSendMoney
          ? (double.tryParse(_feeCtrl.text.replaceAll(',', '')) ?? 0)
          : 0,
      'notes': '',
      'sim_iccid': _simMap?[_selectedProvider]?.iccid ?? '',
      'sim_slot': _simMap?[_selectedProvider]?.slot,
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

    context.push(
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
        'selections_in_order':
            _isTelecelDataBundle && _selectedTelecelBundle != null
                ? <String>[_selectedTelecelBundle!.digit]
                : const <String>[],
      },
    );

    if (mounted) {
      setState(() => _loading = false);
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
    if (template != null) {
      try {
        await OfflineQueueService.cacheTemplate(
          provider,
          transactionType,
          template,
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
        },
      );

      final rawData = flowRes.data['data'];
      if (rawData is! Map) return;

      await OfflineQueueService.cacheFlow(
        provider,
        transactionType,
        Map<String, dynamic>.from(rawData),
      );
    } catch (_) {
      // No custom flow, no network, or cache failure. The active
      // transaction continues through the progress screen normally.
    }
  }

  Future<void> _submitManualCashOut() async {
    final amount = double.tryParse(_amountCtrl.text.replaceAll(",", ""));
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Enter the cash amount given to the customer"),
        ),
      );
      return;
    }
    setState(() => _loading = true);
    try {
      await ApiClient.instance.post(
        "/balances/cash-out-manual",
        data: {
          "provider": _selectedProvider,
          "amount": amount,
          "reference": _customerPhoneCtrl.text.trim(),
          "notes": "Manual Cash Out",
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Cash Out recorded successfully")),
        );
        context.pop();
      }
    } on DioException catch (e) {
      final msg = e.response?.data?["message"] ?? "Failed to record Cash Out";
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor),
        );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_title)),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // SIM-aware network selection.
              if (!_needsReference) ...[
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
                              'at_money': 'AT Money',
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
                  const SizedBox(height: 20),
                ] else ...[
                  const Text(
                    'Using SIM',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
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
                  const SizedBox(height: 20),
                ],
              ],

              // Merchant ID (Pay to Merchant)
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

              if (_isTelecelDataBundle) ...[
                DropdownButtonFormField<AgentTelecelBundleOption>(
                  value: _selectedTelecelBundle,
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

              // Customer Phone - labeled "Enter Number" for Pay to Agent
              // (no walk-in customer in that flow, just a number being
              // paid), "Customer Phone Number" everywhere else. Not
              // shown at all for Pay to Merchant (Merchant ID instead).
              if (_needsCustomer) ...[
                AppTextField(
                  controller: _customerPhoneCtrl,
                  label: [
                    'business_deposit',
                    'business_withdrawal',
                  ].contains(widget.transactionType)
                      ? 'Agent Short Code'
                      : (_needsReference
                          ? 'Enter Number'
                          : 'Customer Phone Number'),
                  hint: [
                    'business_deposit',
                    'business_withdrawal',
                  ].contains(widget.transactionType)
                      ? 'Enter agent short code'
                      : '024XXXXXXX',
                  keyboardType: TextInputType.phone,
                  prefixIcon: Icons.phone_outlined,
                  validator: (v) =>
                      v!.isEmpty ? 'Phone number is required' : null,
                ),
                const SizedBox(height: 14),
              ],

              // Recipient (Send Money)
              if (_needsRecipient) ...[
                AppTextField(
                  controller: _recipientPhoneCtrl,
                  label: 'Recipient Phone Number',
                  hint: '024XXXXXXX',
                  keyboardType: TextInputType.phone,
                  prefixIcon: Icons.person_add_outlined,
                  validator: (v) =>
                      v!.isEmpty ? 'Recipient phone is required' : null,
                ),
                const SizedBox(height: 14),
              ],

              // Reference (Pay to Agent / Pay to Merchant)
              if (_needsReference) ...[
                AppTextField(
                  controller: _referenceCtrl,
                  label: 'Reference',
                  prefixIcon: Icons.notes_outlined,
                  validator: (v) => v!.isEmpty ? 'Reference is required' : null,
                ),
                const SizedBox(height: 14),
              ],

              // Amount
              if (_needsAmount) ...[
                TextFormField(
                  controller: _amountCtrl,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
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
                    if (v!.isEmpty) return 'Amount is required';
                    final n = double.tryParse(v);
                    if (n == null || n <= 0) return 'Enter a valid amount';
                    return null;
                  },
                ),
                const SizedBox(height: 14),
              ],

              // Transfer Charge (Send Money only) - auto-calculated
              // at 1% of amount with no cap, but the agent can
              // always edit it to match what the network actually
              // charged during the USSD dial.
              if (_isSendMoney) ...[
                TextFormField(
                  controller: _feeCtrl,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                  ],
                  decoration: InputDecoration(
                    labelText: 'Transfer Charge (GH₵)',
                    hintText: '0.00',
                    prefixIcon: const Icon(Icons.receipt_long_outlined),
                    prefixText: 'GH₵  ',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    filled: true,
                    fillColor: context.appSurface,
                    helperText: 'Auto-calculated at 1% - editable',
                  ),
                  onChanged: (_) => _feeAutoCalculated = false,
                  validator: (v) {
                    if (v == null || v.isEmpty) return null;
                    final n = double.tryParse(v);
                    if (n == null || n < 0) return 'Enter a valid charge';
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
                        ? Colors.blue[900]!.withOpacity(0.25)
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
