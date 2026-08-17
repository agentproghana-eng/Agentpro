// personal_transaction_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/services/sim_card_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';

const Map<String, String> kPersonalTransactionLabels = {
  'send_money': 'Send Money',
  'send_money_same_network': 'Send Money (Same Network)',
  'send_money_cross_network': 'Send Money (Other Network)',
  'buy_airtime': 'Buy Airtime',
  'buy_data': 'Buy Data',
  'buy_mashup': 'Mash Up',
  'check_momo_balance': 'Check MoMo Balance',
  'check_airtime_balance': 'Check Airtime Balance',
  'withdraw_cash': 'Withdraw Cash',
};

const List<String> kNoAmountPersonalTypes = [
  'check_momo_balance',
  'check_airtime_balance',
];

class DataBundleOption {
  final String label;
  final String digit;
  const DataBundleOption(this.label, this.digit);
}

class DataBundleCategory {
  final String id;
  final String label;
  final String sub;
  final IconData icon;
  const DataBundleCategory(this.id, this.label, this.sub, this.icon);
}

const List<DataBundleCategory> kDataBundleCategories = [
  DataBundleCategory(
    'flexi',
    'Flexi',
    'Pick your own amount',
    Icons.flash_on_outlined,
  ),
  DataBundleCategory('2moorch', '2Moorch', 'No expiry', Icons.all_inclusive),
  DataBundleCategory(
    'daily',
    'Daily / Bossu',
    'Short validity',
    Icons.today_outlined,
  ),
  DataBundleCategory(
    'weekly',
    'Weekly',
    '7-day validity',
    Icons.date_range_outlined,
  ),
  DataBundleCategory(
    'monthly',
    'Monthly / Jumbo',
    '30-day validity',
    Icons.calendar_month_outlined,
  ),
  DataBundleCategory(
    'night',
    'Night King',
    '12am – 5am',
    Icons.nightlight_outlined,
  ),
];

const Map<String, List<DataBundleOption>> kDataBundleOptions = {
  'daily': [
    DataBundleOption('50MB — GHS 1', '1'),
    DataBundleOption('111MB — GHS 2', '2'),
    DataBundleOption('446MB — GHS 3 (1 day)', '3'),
    DataBundleOption('780MB — GHS 5 (3 days)', '4'),
    DataBundleOption('1.11GB — GHS 10 (5 days)', '5'),
    DataBundleOption('2GB — GHS 15 (5 days)', '6'),
  ],
  'weekly': [
    DataBundleOption('1000MB — GHS 10 (15 days)', '1'),
    DataBundleOption('2.56GB — GHS 20 (5 days)', '2'),
  ],
  'monthly': [
    DataBundleOption('2.45GB — GHS 20 (30 days)', '1'),
    DataBundleOption('6.13GB — GHS 50 (30 days)', '2'),
    DataBundleOption('12.81GB — GHS 100 (30 days)', '3'),
    DataBundleOption('39GB — GHS 200 (30 days)', '4'),
    DataBundleOption('111.43GB — GHS 300 (30 days)', '5'),
    DataBundleOption('263.38GB — GHS 400 (30 days)', '6'),
  ],
  'night': [
    DataBundleOption('10.03GB — GHS 3, No expiry (12am–5am)', '1'),
    DataBundleOption('4.02GB — GHS 2, No expiry (12am–5am)', '2'),
  ],
};

const List<DataBundleOption> kMoorchPage1 = [
  DataBundleOption('22MB — GHS 0.5', '1'),
  DataBundleOption('50MB — GHS 1', '2'),
  DataBundleOption('111MB — GHS 2', '3'),
  DataBundleOption('557MB — GHS 5', '4'),
  DataBundleOption('892MB — GHS 10', '5'),
  DataBundleOption('1.67GB — GHS 20', '6'),
  DataBundleOption('4.46GB — GHS 50', '7'),
  DataBundleOption('10GB — GHS 100', '8'),
  DataBundleOption('33.43GB — GHS 200', '9'),
];
const List<DataBundleOption> kMoorchPage2 = [
  DataBundleOption('100.29GB — GHS 300', '1'),
  DataBundleOption('253.25GB — GHS 400', '2'),
];

const List<DataBundleOption> kFlexiTypes = [
  DataBundleOption('6MB · 1 day', '1'),
  DataBundleOption('4MB · No expiry', '2'),
];
const List<DataBundleOption> kFlexiPayment = [
  DataBundleOption('Pay with Airtime', '1'),
  DataBundleOption('Pay with Telecel Cash', '2'),
];

class PersonalTransactionScreen extends StatefulWidget {
  final String transactionType;
  final String provider;
  final int? simSlot;
  final String? simIccid;
  final int? simSubscriptionId;

  const PersonalTransactionScreen({
    super.key,
    required this.transactionType,
    required this.provider,
    this.simSlot,
    this.simIccid,
    this.simSubscriptionId,
  });

  @override
  State<PersonalTransactionScreen> createState() =>
      _PersonalTransactionScreenState();
}

class _PersonalTransactionScreenState extends State<PersonalTransactionScreen> {
  final _formKey = GlobalKey<FormState>();
  final _amountCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _referenceCtrl = TextEditingController();
  final _tillNumberCtrl = TextEditingController();
  final _flexiAmountCtrl = TextEditingController();
  bool _loading = false;

  List<SimCard> _simCards = const [];
  int? _selectedSimSlot;
  bool _simDetectionComplete = false;
  bool _simPermissionDenied = false;
  bool _initialSimIdentityUnavailable = false;

  static const Map<String, String> _mtnCrossNetworkOptions = {
    '1': 'AT',
    '2': 'Telecel',
    '3': 'E-zwich',
    '4': 'G-Money',
    '5': 'Zeepay',
    '6': 'GhanaPay',
  };

  String? _crossNetworkSelection;
  String? _sendMoneyMode;

  bool get _isUnifiedSendMoney => widget.transactionType == 'send_money';

  String get _effectiveTransactionType {
    if (!_isUnifiedSendMoney) {
      return widget.transactionType;
    }

    return switch (_sendMoneyMode) {
      'same_network' => 'send_money_same_network',
      'other_network' => 'send_money_cross_network',
      _ => widget.transactionType,
    };
  }

  bool get _isMtnCrossNetwork =>
      widget.provider == 'mtn' &&
      _effectiveTransactionType == 'send_money_cross_network';

  bool get _isMtnAirtime =>
      widget.provider == 'mtn' && widget.transactionType == 'buy_airtime';

  String get _providerLabel => switch (widget.provider) {
        'mtn' => 'MTN',
        'telecel' => 'Telecel',
        'at_money' => 'AT Money',
        _ => widget.provider,
      };

  List<SimCard> get _providerSims {
    final sims = _simCards
        .where((sim) => sim.network == widget.provider)
        .toList()
      ..sort((a, b) => a.slot.compareTo(b.slot));

    return sims;
  }

  SimCard? get _selectedSim {
    final sims = _providerSims;

    if (sims.isEmpty) return null;

    if (_selectedSimSlot != null) {
      for (final sim in sims) {
        if (sim.slot == _selectedSimSlot) {
          return sim;
        }
      }
    }

    // If Home explicitly routed this transaction to a physical SIM,
    // never silently substitute another SIM.
    if (_initialSimIdentityUnavailable) {
      return null;
    }

    return sims.first;
  }

  bool get _isDataBundle => widget.transactionType == 'buy_data';

  bool get _needsAmount {
    if (_isUnifiedSendMoney && _sendMoneyMode == null) {
      return false;
    }

    return !kNoAmountPersonalTypes.contains(_effectiveTransactionType) &&
        !_isDataBundle;
  }

  bool get _needsPhone {
    if (_isUnifiedSendMoney && _sendMoneyMode == null) {
      return false;
    }

    if (_isMtnAirtime) {
      return _recipientMode == 'other';
    }

    return !kNoAmountPersonalTypes.contains(_effectiveTransactionType) &&
        _effectiveTransactionType != 'withdraw_cash' &&
        !_isDataBundle;
  }

  bool get _needsReference => [
        'send_money_same_network',
        'send_money_cross_network',
      ].contains(_effectiveTransactionType);

  bool get _referenceRequired =>
      widget.provider == 'mtn' &&
      [
        'send_money_same_network',
        'send_money_cross_network',
      ].contains(_effectiveTransactionType);

  bool get _needsTillNumber => widget.transactionType == 'withdraw_cash';

  String _dbStep = 'recipient_mode';
  String? _recipientMode;
  String? _bundleCategory;
  DataBundleOption? _bundleChoice;
  int _moorchPage = 1;
  int _moorchBundlePage = 1;
  DataBundleOption? _flexiType;
  DataBundleOption? _flexiPayment;

  DataBundleCategory? get _categoryObj {
    for (final c in kDataBundleCategories) {
      if (c.id == _bundleCategory) return c;
    }
    return null;
  }

  List<String> _computeSelections() {
    if (_bundleCategory == 'flexi') {
      return [
        if (_flexiType != null) _flexiType!.digit,
        if (_flexiPayment != null) _flexiPayment!.digit,
      ];
    }
    if (_bundleCategory == '2moorch') {
      if (_bundleChoice == null) return [];
      return [if (_moorchBundlePage == 2) '99', _bundleChoice!.digit];
    }
    return [if (_bundleChoice != null) _bundleChoice!.digit];
  }

  @override
  void initState() {
    super.initState();

    _selectedSimSlot = widget.simSlot;
    _loadSimIdentity();

    if (widget.transactionType == 'buy_mashup') {
      final state = context.read<AuthBloc>().state;
      if (state is AuthAuthenticated) {
        _phoneCtrl.text = (state.user['phone'] ?? '').toString();
      }
    }
  }

  Future<void> _loadSimIdentity() async {
    if (mounted) {
      setState(() {
        _simDetectionComplete = false;
        _simPermissionDenied = false;
      });
    }

    try {
      var detected = await SimCardService.getSimCards();

      if (detected.isEmpty) {
        await Future.delayed(const Duration(milliseconds: 1200));

        if (!mounted) return;

        detected = await SimCardService.getSimCards();
      }

      // Apply the same Personal-vs-Business SIM purpose rule used by
      // Personal Home. A SIM explicitly reserved for Agent/Business
      // must not become selectable merely because this form re-detected it.
      final purposes = <int, String>{};

      try {
        final response = await ApiClient.instance.get(
          '/user-sim-purposes',
        );

        final saved = (response.data['data'] as List?) ?? const [];

        for (final value in saved) {
          if (value is! Map) continue;

          final slot = value['sim_slot'];
          final purpose = value['purpose'];

          if (slot is int && purpose is String) {
            purposes[slot] = purpose;
          }
        }
      } catch (_) {
        // Match Personal Home: if purpose lookup is unavailable,
        // keep detected supported SIMs available.
      }

      final supported = detected
          .where(
            (sim) => sim.isMoMoSupported && purposes[sim.slot] != 'agent',
          )
          .toList()
        ..sort((a, b) => a.slot.compareTo(b.slot));

      final providerSims = supported
          .where((sim) => sim.network == widget.provider)
          .toList()
        ..sort((a, b) => a.slot.compareTo(b.slot));

      final requestedIccid = (widget.simIccid ?? '').trim();

      final exactSimRequested = widget.simSlot != null ||
          requestedIccid.isNotEmpty ||
          widget.simSubscriptionId != null;

      SimCard? requestedSim;

      if (exactSimRequested) {
        for (final sim in providerSims) {
          final slotMatches =
              widget.simSlot == null || sim.slot == widget.simSlot;

          final identityMatches = requestedIccid.isNotEmpty
              ? sim.iccid.trim() == requestedIccid && slotMatches
              : widget.simSubscriptionId != null
                  ? slotMatches &&
                      sim.subscriptionId == widget.simSubscriptionId
                  : slotMatches;

          if (identityMatches) {
            requestedSim = sim;
            break;
          }
        }
      }

      if (!mounted) return;

      setState(() {
        _simCards = supported;
        _simDetectionComplete = true;
        _simPermissionDenied = false;

        if (providerSims.isEmpty) {
          _selectedSimSlot = null;
          _initialSimIdentityUnavailable = exactSimRequested;
        } else if (exactSimRequested) {
          _selectedSimSlot = requestedSim?.slot;
          _initialSimIdentityUnavailable = requestedSim == null;
        } else {
          _selectedSimSlot = providerSims.first.slot;
          _initialSimIdentityUnavailable = false;
        }
      });
    } on SimPermissionException {
      if (!mounted) return;

      setState(() {
        _simCards = const [];
        _selectedSimSlot = null;
        _simDetectionComplete = true;
        _simPermissionDenied = true;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _simCards = const [];
        _selectedSimSlot = null;
        _simDetectionComplete = true;
        _simPermissionDenied = false;
      });
    }
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _phoneCtrl.dispose();
    _referenceCtrl.dispose();
    _tillNumberCtrl.dispose();
    _flexiAmountCtrl.dispose();
    super.dispose();
  }

  void _selectCategory(String id) {
    setState(() {
      _bundleCategory = id;
      if (id == 'flexi') {
        _dbStep = 'flexi_type';
      } else if (id == '2moorch') {
        _dbStep = 'moorch';
      } else {
        _dbStep = 'bundle';
      }
    });
  }

  Future<void> _submit() async {
    if (_isDataBundle) {
      await _submitDataBundle();
      return;
    }
    if (!_formKey.currentState!.validate()) return;

    if (!_simDetectionComplete) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('SIM detection is still in progress.'),
        ),
      );
      return;
    }

    final selectedSim = _selectedSim;

    if (selectedSim == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _simPermissionDenied
                ? 'Allow phone permission before starting this transaction.'
                : 'The $_providerLabel SIM selected for this transaction is required.',
          ),
        ),
      );
      return;
    }

    setState(() => _loading = true);
    String? progressAction;

    final reference = _referenceCtrl.text.trim();
    final transactionType = _effectiveTransactionType;

    final requestFields = <String, dynamic>{
      'provider': widget.provider,
      'transaction_type': transactionType,
      if (_isMtnAirtime && _recipientMode != null)
        'recipient_mode': _recipientMode,
      if (_needsAmount) 'amount': double.tryParse(_amountCtrl.text.trim()),
      if (_needsPhone) 'recipient_phone': _phoneCtrl.text.trim(),
      if (_needsReference && reference.isNotEmpty) 'notes': reference,
      if (_needsTillNumber) 'merchant_id': _tillNumberCtrl.text.trim(),
      if (selectedSim.iccid.isNotEmpty) 'sim_iccid': selectedSim.iccid,
      'sim_slot': selectedSim.slot,
      'sim_subscription_id': selectedSim.subscriptionId,
    };

    try {
      final res = await ApiClient.instance.post(
        '/personal-transactions',
        data: requestFields,
      );

      final transaction = res.data['data'];
      if (!mounted) return;

      progressAction = await context.push<String>(
        '/transactions/progress',
        extra: {
          'is_personal': true,
          'transaction': transaction,
          'provider': widget.provider,
          'transaction_type': transactionType,
          if (_isMtnAirtime && _recipientMode != null)
            'recipient_mode': _recipientMode,
          'amount': _needsAmount ? _amountCtrl.text.trim() : null,
          'customer_phone': _needsPhone ? _phoneCtrl.text.trim() : null,
          'sim_slot': selectedSim.slot,
          'sim_iccid': selectedSim.iccid.isNotEmpty ? selectedSim.iccid : null,
          'sim_subscription_id': selectedSim.subscriptionId,
          'request_fields': requestFields,
          if (_isMtnCrossNetwork && _crossNetworkSelection != null)
            'selections_in_order': [
              _crossNetworkSelection!,
            ],
        },
      );
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ??
          'Failed to start transaction. Please try again.';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }

    if (mounted && progressAction == 'retry_now') {
      await _submit();
    }
  }

  Future<void> _submitDataBundle() async {
    if (!_simDetectionComplete) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('SIM detection is still in progress.'),
        ),
      );
      return;
    }

    final selectedSim = _selectedSim;

    if (selectedSim == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _simPermissionDenied
                ? 'Allow phone permission before starting this transaction.'
                : 'The $_providerLabel SIM selected for this transaction is required.',
          ),
        ),
      );
      return;
    }

    setState(() => _loading = true);
    String? progressAction;
    final recipientPhone =
        _recipientMode == 'other' ? _phoneCtrl.text.trim() : null;
    final flexiAmount =
        _bundleCategory == 'flexi' ? _flexiAmountCtrl.text.trim() : null;

    try {
      final res = await ApiClient.instance.post(
        '/personal-transactions',
        data: {
          'provider': widget.provider,
          'transaction_type': widget.transactionType,
          'bundle_category': _bundleCategory,
          'recipient_mode': _recipientMode,
          if (recipientPhone != null) 'recipient_phone': recipientPhone,
          if (flexiAmount != null) 'amount': double.tryParse(flexiAmount),
          if (selectedSim.iccid.isNotEmpty) 'sim_iccid': selectedSim.iccid,
          'sim_slot': selectedSim.slot,
          'sim_subscription_id': selectedSim.subscriptionId,
        },
      );

      final transaction = res.data['data'];
      if (!mounted) return;

      progressAction = await context.push<String>(
        '/transactions/progress',
        extra: {
          'is_personal': true,
          'transaction': transaction,
          'provider': widget.provider,
          'transaction_type': widget.transactionType,
          'bundle_category': _bundleCategory,
          'recipient_mode': _recipientMode,
          'selections_in_order': _computeSelections(),
          'amount': flexiAmount,
          'customer_phone': recipientPhone,
          'sim_slot': selectedSim.slot,
          'sim_iccid': selectedSim.iccid.isNotEmpty ? selectedSim.iccid : null,
          'sim_subscription_id': selectedSim.subscriptionId,
          'request_fields': {
            if (flexiAmount != null) 'amount': flexiAmount,
            if (recipientPhone != null) 'customer_phone': recipientPhone,
          },
        },
      );
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ??
          'Failed to start transaction. Please try again.';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }

    if (mounted && progressAction == 'retry_now') {
      await _submitDataBundle();
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = kPersonalTransactionLabels[widget.transactionType] ??
        widget.transactionType;
    final appBarLabel = switch (widget.transactionType) {
      'send_money_same_network' => 'Send Money',
      'send_money_cross_network' => 'Send Money',
      _ => label,
    };

    return Scaffold(
      appBar: AppBar(
        title: Text(appBarLabel),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            _buildLockedSimSection(context),
            const SizedBox(height: 16),
            Expanded(
              child: _isDataBundle
                  ? _buildDataBundleFlow(context)
                  : _buildGenericForm(context, label),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLockedSimSection(BuildContext context) {
    if (!_simDetectionComplete) {
      return Row(
        children: [
          const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: 10),
          Text(
            'Detecting $_providerLabel SIMs…',
            style: const TextStyle(
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      );
    }

    final sims = _providerSims;
    final selected = _selectedSim;

    if (sims.isEmpty) {
      return Container(
        width: double.infinity,
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
                    ? 'Allow phone permission to detect your $_providerLabel SIM.'
                    : 'Insert a Personal $_providerLabel SIM to continue.',
                style: TextStyle(
                  color: context.appSecondaryText,
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
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
                selected == null
                    ? Icons.sim_card_alert_outlined
                    : Icons.sim_card_outlined,
                color: selected == null
                    ? context.appSecondaryText
                    : AppTheme.providerColor(widget.provider),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  selected == null
                      ? 'The selected physical SIM is no longer available.'
                      : '$_providerLabel locked · Using SIM ${selected.slot + 1}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ),
              if (selected != null) const Icon(Icons.lock_outline, size: 18),
            ],
          ),
        ),
        if (sims.length > 1 || selected == null) ...[
          const SizedBox(height: 10),
          Text(
            'Select physical $_providerLabel SIM',
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: sims.map((sim) {
              final isSelected = selected?.slot == sim.slot;
              final color = AppTheme.providerColor(
                widget.provider,
              );

              final iccid = sim.iccid.trim();
              final tail = iccid.isEmpty
                  ? ''
                  : iccid.substring(
                      iccid.length > 6 ? iccid.length - 6 : 0,
                    );

              return ChoiceChip(
                selected: isSelected,
                selectedColor: color.withValues(alpha: 0.16),
                avatar: Icon(
                  Icons.sim_card_outlined,
                  size: 18,
                  color: isSelected ? color : context.appSecondaryText,
                ),
                label: Text(
                  'SIM ${sim.slot + 1}'
                  '${tail.isNotEmpty ? ' · $tail' : ''}',
                ),
                onSelected: (_) {
                  setState(() {
                    _selectedSimSlot = sim.slot;
                    _initialSimIdentityUnavailable = false;
                  });
                },
              );
            }).toList(),
          ),
        ],
      ],
    );
  }

  Widget _buildGenericForm(BuildContext context, String label) {
    return Form(
      key: _formKey,
      child: ListView(
        children: [
          if (_isUnifiedSendMoney) ...[
            DropdownButtonFormField<String>(
              initialValue: _sendMoneyMode,
              decoration: const InputDecoration(
                labelText: 'Where are you sending?',
                prefixIcon: Icon(Icons.send_outlined),
                helperText: 'Choose Same Network or Other Network',
              ),
              items: const [
                DropdownMenuItem<String>(
                  value: 'same_network',
                  child: Text('Same Network'),
                ),
                DropdownMenuItem<String>(
                  value: 'other_network',
                  child: Text('Other Network'),
                ),
              ],
              onChanged: (value) {
                setState(() {
                  _sendMoneyMode = value;

                  // Network selection only belongs to the MTN
                  // cross-network variant.
                  _crossNetworkSelection = null;
                });
              },
              validator: (value) =>
                  value == null ? 'Choose where you are sending money' : null,
            ),
            const SizedBox(height: 14),
          ],
          if (_isMtnAirtime) ...[
            DropdownButtonFormField<String>(
              initialValue: _recipientMode,
              decoration: const InputDecoration(
                labelText: 'Who is receiving the airtime?',
                prefixIcon: Icon(Icons.person_outline),
                helperText: 'Choose the MTN airtime destination',
              ),
              items: const [
                DropdownMenuItem<String>(
                  value: 'self',
                  child: Text('Myself'),
                ),
                DropdownMenuItem<String>(
                  value: 'other',
                  child: Text('Someone else'),
                ),
              ],
              onChanged: (value) {
                setState(() {
                  _recipientMode = value;

                  if (value == 'self') {
                    _phoneCtrl.clear();
                  }
                });
              },
              validator: (value) =>
                  value == null ? 'Choose who is receiving the airtime' : null,
            ),
            const SizedBox(height: 14),
            AppTextField(
              controller: _amountCtrl,
              label: 'Amount (GHS)',
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              prefixIcon: Icons.payments_outlined,
              validator: (v) {
                final n = double.tryParse((v ?? '').trim());
                if (n == null || n <= 0) {
                  return 'Enter a valid amount';
                }
                return null;
              },
            ),
            const SizedBox(height: 14),
            if (_needsPhone) ...[
              AppTextField(
                controller: _phoneCtrl,
                label: 'Recipient Phone',
                keyboardType: TextInputType.phone,
                prefixIcon: Icons.phone_outlined,
                validator: (v) => (v ?? '').trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 14),
            ],
          ],
          if (_isMtnCrossNetwork) ...[
            DropdownButtonFormField<String>(
              initialValue: _crossNetworkSelection,
              decoration: const InputDecoration(
                labelText: 'Recipient Network',
                prefixIcon: Icon(Icons.cell_tower_outlined),
                helperText: 'Choose the destination network shown by MTN',
              ),
              items: _mtnCrossNetworkOptions.entries
                  .map(
                    (entry) => DropdownMenuItem<String>(
                      value: entry.key,
                      child: Text(entry.value),
                    ),
                  )
                  .toList(),
              onChanged: (value) {
                setState(() {
                  _crossNetworkSelection = value;
                });
              },
              validator: (value) =>
                  value == null ? 'Recipient network is required' : null,
            ),
            const SizedBox(height: 14),
          ],
          if (!_isMtnAirtime && _needsPhone) ...[
            AppTextField(
              controller: _phoneCtrl,
              label: 'Recipient Phone',
              keyboardType: TextInputType.phone,
              prefixIcon: Icons.phone_outlined,
              validator: (v) => (v ?? '').trim().isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 14),
          ],
          if (!_isMtnAirtime && _needsAmount) ...[
            AppTextField(
              controller: _amountCtrl,
              label: 'Amount (GHS)',
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              prefixIcon: Icons.payments_outlined,
              validator: (v) {
                final n = double.tryParse((v ?? '').trim());
                if (n == null || n <= 0) return 'Enter a valid amount';
                return null;
              },
            ),
            const SizedBox(height: 14),
          ],
          if (_needsReference) ...[
            AppTextField(
              controller: _referenceCtrl,
              label: _referenceRequired ? 'Reference' : 'Reference (optional)',
              prefixIcon: Icons.notes_outlined,
              validator: _referenceRequired
                  ? (v) =>
                      (v ?? '').trim().isEmpty ? 'Reference is required' : null
                  : null,
            ),
            const SizedBox(height: 14),
          ],
          if (_needsTillNumber) ...[
            AppTextField(
              controller: _tillNumberCtrl,
              label: 'Till Number',
              keyboardType: TextInputType.number,
              prefixIcon: Icons.storefront_outlined,
              validator: (v) =>
                  (v ?? '').trim().isEmpty ? 'Till number is required' : null,
            ),
            const SizedBox(height: 14),
          ],
          if (!_needsAmount)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.isDarkMode
                    ? const Color(0xFF1A2B45)
                    : Colors.blue[50],
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'This will dial your $label enquiry - no amount or recipient needed.',
                style: TextStyle(
                  fontSize: 12,
                  color: context.isDarkMode
                      ? const Color(0xFF8FB8E8)
                      : const Color(0xFF1A4D8F),
                ),
              ),
            ),
          const SizedBox(height: 24),
          AppButton(label: 'Continue', onPressed: _submit, isLoading: _loading),
        ],
      ),
    );
  }

  Widget _buildDataBundleFlow(BuildContext context) {
    switch (_dbStep) {
      case 'recipient_mode':
        return _dbRecipientModeStep(context);
      case 'recipient_phone':
        return _dbRecipientPhoneStep(context);
      case 'category':
        return _dbCategoryStep(context);
      case 'bundle':
        return _dbBundleListStep(
          context,
          kDataBundleOptions[_bundleCategory] ?? const [],
        );
      case 'moorch':
        return _dbMoorchStep(context);
      case 'flexi_type':
        return _dbSimpleChoiceStep(
          context,
          title: 'Flexi bundle type',
          subtitle: 'How should this data be valid?',
          options: kFlexiTypes,
          onBack: () => setState(() => _dbStep = 'category'),
          onPick: (opt) => setState(() {
            _flexiType = opt;
            _dbStep = 'flexi_payment';
          }),
        );
      case 'flexi_payment':
        return _dbSimpleChoiceStep(
          context,
          title: 'Payment method',
          subtitle: 'How should this be paid for?',
          options: kFlexiPayment,
          onBack: () => setState(() => _dbStep = 'flexi_type'),
          onPick: (opt) => setState(() {
            _flexiPayment = opt;
            _dbStep = 'flexi_amount';
          }),
        );
      case 'flexi_amount':
        return _dbFlexiAmountStep(context);
      case 'review':
        return _dbReviewStep(context);
      default:
        return _dbRecipientModeStep(context);
    }
  }

  Widget _dbBack(VoidCallback onBack) => Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: onBack,
          icon: const Icon(Icons.chevron_left),
          label: const Text('Back'),
        ),
      );

  Widget _dbRecipientModeStep(BuildContext context) {
    return ListView(
      children: [
        Text('Who is this for?', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          'This decides whether we ask for a recipient number.',
          style: TextStyle(color: context.appSecondaryText),
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: _dbBigOption(context, 'Self', Icons.person_outline, () {
                setState(() {
                  _recipientMode = 'self';
                  _dbStep = 'category';
                });
              }),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _dbBigOption(context, 'Other', Icons.people_outline, () {
                setState(() {
                  _recipientMode = 'other';
                  _dbStep = 'recipient_phone';
                });
              }),
            ),
          ],
        ),
      ],
    );
  }

  Widget _dbBigOption(
    BuildContext context,
    String label,
    IconData icon,
    VoidCallback onTap,
  ) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 28),
        decoration: BoxDecoration(
          border: Border.all(color: context.appDivider),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Icon(icon, color: Theme.of(context).colorScheme.primary, size: 26),
            const SizedBox(height: 8),
            Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }

  Widget _dbRecipientPhoneStep(BuildContext context) {
    return ListView(
      children: [
        _dbBack(() => setState(() => _dbStep = 'recipient_mode')),
        Text(
          "Recipient's number",
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 4),
        Text(
          'Who is receiving this data bundle?',
          style: TextStyle(color: context.appSecondaryText),
        ),
        const SizedBox(height: 20),
        AppTextField(
          controller: _phoneCtrl,
          label: 'Recipient Phone',
          keyboardType: TextInputType.phone,
          prefixIcon: Icons.phone_outlined,
        ),
        const SizedBox(height: 20),
        AppButton(
          label: 'Continue',
          onPressed: () {
            if (_phoneCtrl.text.trim().length < 9) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Enter a valid phone number')),
              );
              return;
            }
            setState(() => _dbStep = 'category');
          },
        ),
      ],
    );
  }

  Widget _dbCategoryStep(BuildContext context) {
    return ListView(
      children: [
        _dbBack(
          () => setState(
            () => _dbStep = _recipientMode == 'other'
                ? 'recipient_phone'
                : 'recipient_mode',
          ),
        ),
        Text(
          'Choose a category',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 16),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.3,
          children: kDataBundleCategories.map((cat) {
            return InkWell(
              onTap: () => _selectCategory(cat.id),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  border: Border.all(color: context.appDivider),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      cat.icon,
                      color: Theme.of(context).colorScheme.primary,
                      size: 22,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      cat.label,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      cat.sub,
                      style: TextStyle(
                        fontSize: 11,
                        color: context.appSecondaryText,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _dbBundleListStep(
    BuildContext context,
    List<DataBundleOption> options,
  ) {
    return ListView(
      children: [
        _dbBack(() => setState(() => _dbStep = 'category')),
        Text(
          _categoryObj?.label ?? '',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 4),
        Text(
          'Pick a bundle.',
          style: TextStyle(color: context.appSecondaryText),
        ),
        const SizedBox(height: 16),
        ...options.map(
          (opt) => _dbOptionTile(opt, () {
            setState(() {
              _bundleChoice = opt;
              _dbStep = 'review';
            });
          }),
        ),
      ],
    );
  }

  Widget _dbMoorchStep(BuildContext context) {
    final options = _moorchPage == 1 ? kMoorchPage1 : kMoorchPage2;
    return ListView(
      children: [
        _dbBack(() => setState(() => _dbStep = 'category')),
        Text(
          '2Moorch No Expiry',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        Text(
          'Page $_moorchPage of 2',
          style: TextStyle(color: context.appSecondaryText),
        ),
        const SizedBox(height: 16),
        ...options.map(
          (opt) => _dbOptionTile(opt, () {
            setState(() {
              _bundleChoice = opt;
              _moorchBundlePage = _moorchPage;
              _dbStep = 'review';
            });
          }),
        ),
        if (_moorchPage == 1)
          OutlinedButton.icon(
            onPressed: () => setState(() => _moorchPage = 2),
            icon: const Icon(Icons.chevron_right),
            label: const Text('See more'),
          )
        else
          OutlinedButton.icon(
            onPressed: () => setState(() => _moorchPage = 1),
            icon: const Icon(Icons.chevron_left),
            label: const Text('Back to page 1'),
          ),
      ],
    );
  }

  Widget _dbSimpleChoiceStep(
    BuildContext context, {
    required String title,
    required String subtitle,
    required List<DataBundleOption> options,
    required VoidCallback onBack,
    required void Function(DataBundleOption) onPick,
  }) {
    return ListView(
      children: [
        _dbBack(onBack),
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(subtitle, style: TextStyle(color: context.appSecondaryText)),
        const SizedBox(height: 16),
        ...options.map((opt) => _dbOptionTile(opt, () => onPick(opt))),
      ],
    );
  }

  Widget _dbFlexiAmountStep(BuildContext context) {
    return ListView(
      children: [
        _dbBack(() => setState(() => _dbStep = 'flexi_payment')),
        Text('Amount', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          'GHS 0.02 – 999.99. Telecel computes the MB.',
          style: TextStyle(color: context.appSecondaryText),
        ),
        const SizedBox(height: 16),
        AppTextField(
          controller: _flexiAmountCtrl,
          label: 'Amount (GHS)',
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          prefixIcon: Icons.payments_outlined,
        ),
        const SizedBox(height: 20),
        AppButton(
          label: 'Continue',
          onPressed: () {
            final n = double.tryParse(_flexiAmountCtrl.text.trim());
            if (n == null || n < 0.02 || n > 999.99) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Enter an amount between GHS 0.02 and 999.99'),
                ),
              );
              return;
            }
            setState(() => _dbStep = 'review');
          },
        ),
      ],
    );
  }

  Widget _dbOptionTile(DataBundleOption opt, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            border: Border.all(color: context.appDivider),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  opt.label,
                  style: const TextStyle(fontWeight: FontWeight.w500),
                ),
              ),
              const Icon(Icons.chevron_right, size: 18),
            ],
          ),
        ),
      ),
    );
  }

  Widget _dbReviewStep(BuildContext context) {
    return ListView(
      children: [
        Text('Review', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            border: Border.all(color: context.appDivider),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            children: [
              _dbReviewRow(
                'For',
                _recipientMode == 'other' ? _phoneCtrl.text.trim() : 'Yourself',
              ),
              _dbReviewRow('Category', _categoryObj?.label ?? ''),
              if (_bundleChoice != null)
                _dbReviewRow('Bundle', _bundleChoice!.label),
              if (_flexiType != null) _dbReviewRow('Type', _flexiType!.label),
              if (_flexiPayment != null)
                _dbReviewRow('Payment', _flexiPayment!.label),
              if (_flexiAmountCtrl.text.trim().isNotEmpty)
                _dbReviewRow('Amount', 'GHS ${_flexiAmountCtrl.text.trim()}'),
            ],
          ),
        ),
        const SizedBox(height: 24),
        AppButton(
          label: 'Start Transaction',
          onPressed: _submit,
          isLoading: _loading,
        ),
      ],
    );
  }

  Widget _dbReviewRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(color: context.appSecondaryText, fontSize: 12),
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
