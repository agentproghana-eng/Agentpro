// personal_transaction_screen.dart
import 'dart:collection';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';
import '../../core/api/api_client.dart';
import '../../core/services/offline_queue_service.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/sim_role_assignment_service.dart';
import '../../core/services/storage_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';

const Map<String, String> kPersonalTransactionLabels = {
  'send_money': 'Transfer Money',
  'send_money_same_network': 'Transfer Money · Same Network',
  'send_money_cross_network': 'Transfer Money · Other Network',
  'buy_airtime': 'Buy Airtime',
  'buy_data': 'Buy Data',
  'buy_mashup': 'MashUp',
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

const List<DataBundleOption> kMtnDataPage1 = [
  DataBundleOption('GHS 0.50', '2'),
  DataBundleOption('GHS 1', '3'),
  DataBundleOption('GHS 3', '4'),
];

const List<DataBundleOption> kMtnDataPage2 = [
  DataBundleOption('GHS 10', '5'),
  DataBundleOption('GHS 350', '6'),
  DataBundleOption('GHS 399', '7'),
];

const List<DataBundleOption> kMtnDataPayment = [
  DataBundleOption('Airtime', '1'),
  DataBundleOption('Mobile Money', '2'),
];

class MtnMashupTier {
  final String id;
  final String label;
  final String digit;
  final double amount;

  const MtnMashupTier(this.id, this.label, this.digit, this.amount);
}

const List<MtnMashupTier> kMtnMashupTiers = [
  MtnMashupTier('ghc1', 'GHS 1', '1', 1),
  MtnMashupTier('ghc5', 'GHS 5', '2', 5),
  MtnMashupTier('ghc10', 'GHS 10', '3', 10),
  MtnMashupTier('ghc30', 'GHS 30 · 3133.94MB · No expiry', '4', 30),
];

const Map<String, List<DataBundleOption>> kMtnMashupAllocations = {
  'ghc1': [
    DataBundleOption('15.27MB + 15.64 mins', '1'),
    DataBundleOption('25.45MB + 11.17 mins', '2'),
    DataBundleOption('30.53MB + 8.94 mins', '3'),
    DataBundleOption('35.62MB + 6.7 mins', '4'),
    DataBundleOption('50.89MB only', '5'),
  ],
  'ghc5': [
    DataBundleOption('86.12MB + 83.24 mins', '1'),
    DataBundleOption('143.54MB + 59.45 mins', '2'),
    DataBundleOption('172.25MB + 47.56 mins', '3'),
    DataBundleOption('200.06MB + 35.67 mins', '4'),
    DataBundleOption('287.08MB only', '5'),
  ],
  'ghc10': [
    DataBundleOption('180.72MB + 173.39 mins', '1'),
    DataBundleOption('301.19MB + 123.85 mins', '2'),
    DataBundleOption('361.43MB + 99.08 mins', '3'),
    DataBundleOption('421.67MB + 74.31 mins', '4'),
    DataBundleOption('602.39MB only', '5'),
  ],
};

const List<DataBundleOption> kMtnMashupPayment = [
  DataBundleOption('Airtime', '1'),
  DataBundleOption('Mobile Money', '2'),
];

class PersonalTransactionScreen extends StatefulWidget {
  final String transactionType;
  final String provider;
  final int? simSlot;
  final String? simIccid;
  final int? simSubscriptionId;
  final String? initialBundleCategory;
  final String? initialRecipientMode;

  const PersonalTransactionScreen({
    super.key,
    required this.transactionType,
    required this.provider,
    this.simSlot,
    this.simIccid,
    this.simSubscriptionId,
    this.initialBundleCategory,
    this.initialRecipientMode,
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

  // Retained while this screen is handling the same financial attempt.
  // A retry with identical request data reuses the same UUID; changing
  // any request field creates a new operation identity.
  String? _pendingClientOperationId;
  String? _pendingClientOperationFingerprint;

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

  bool get _isMtnDataBundle =>
      widget.provider == 'mtn' && widget.transactionType == 'buy_data';

  bool get _isMtnMashup =>
      widget.provider == 'mtn' && widget.transactionType == 'buy_mashup';

  String _mashupStep = 'recipient_mode';
  MtnMashupTier? _mashupTier;
  DataBundleOption? _mashupAllocation;
  DataBundleOption? _mashupPayment;

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
    if (_isMtnDataBundle) {
      if (_bundleCategory == 'fixed_page1' ||
          _bundleCategory == 'fixed_page2') {
        return [if (_bundleChoice != null) _bundleChoice!.digit];
      }

      // Flexi is always menu option 1, so its flow uses a static
      // send_digit step rather than consuming a dynamic selection.
      return const [];
    }

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

  DataBundleOption? _presetMtnDataPayment(String bundleCategory) {
    final normalized = bundleCategory.trim().toLowerCase();

    if (normalized.endsWith('_momo')) {
      return kMtnDataPayment.firstWhere((item) => item.digit == '2');
    }

    if (normalized.endsWith('_airtime')) {
      return kMtnDataPayment.firstWhere((item) => item.digit == '1');
    }

    return null;
  }

  DataBundleOption? _presetMashupPayment(String bundleCategory) {
    final normalized = bundleCategory.trim().toLowerCase();

    if (normalized.endsWith('_momo')) {
      return kMtnMashupPayment.firstWhere((item) => item.digit == '2');
    }

    if (normalized.endsWith('_airtime')) {
      return kMtnMashupPayment.firstWhere((item) => item.digit == '1');
    }

    return null;
  }

  void _applyInitialQuickActionPreset() {
    final recipient = widget.initialRecipientMode?.trim().toLowerCase();

    if (recipient == 'self' || recipient == 'other') {
      _recipientMode = recipient;
    }

    final rawBundle = widget.initialBundleCategory?.trim();

    if (rawBundle == null || rawBundle.isEmpty) {
      if (_isMtnMashup && _recipientMode != null) {
        _mashupStep = _recipientMode == 'other' ? 'recipient_phone' : 'tier';
      } else if (_isDataBundle && _recipientMode != null) {
        _dbStep = _recipientMode == 'other'
            ? 'recipient_phone'
            : (_isMtnDataBundle ? 'mtn_bundle' : 'category');
      }

      return;
    }

    final bundle = rawBundle.toLowerCase();

    if (_isMtnDataBundle) {
      if (bundle.startsWith('flexi_')) {
        _bundleCategory = 'flexi';

        _bundleChoice = const DataBundleOption('Flexi Bundle', '1');

        _flexiPayment = _presetMtnDataPayment(bundle);

        _dbStep = _recipientMode == 'other'
            ? 'recipient_phone'
            : _recipientMode == 'self'
                ? 'mtn_flexi_amount'
                : 'recipient_mode';

        return;
      }

      if (bundle.startsWith('fixed_page1_')) {
        _bundleCategory = 'fixed_page1';

        _flexiPayment = _presetMtnDataPayment(bundle);

        _dbStep = _recipientMode == 'other'
            ? 'recipient_phone'
            : _recipientMode == 'self'
                ? 'mtn_bundle'
                : 'recipient_mode';

        return;
      }

      if (bundle.startsWith('fixed_page2_')) {
        _bundleCategory = 'fixed_page2';

        _flexiPayment = _presetMtnDataPayment(bundle);

        _dbStep = _recipientMode == 'other'
            ? 'recipient_phone'
            : _recipientMode == 'self'
                ? 'mtn_bundle'
                : 'recipient_mode';

        return;
      }
    }

    if (_isMtnMashup) {
      final match = RegExp(
        r'^(ghc1|ghc5|ghc10|ghc30)'
        r'(?:_page[12])?_(airtime|momo)$',
      ).firstMatch(bundle);

      if (match != null) {
        final tierId = match.group(1)!;

        for (final tier in kMtnMashupTiers) {
          if (tier.id == tierId) {
            _mashupTier = tier;
            break;
          }
        }

        _mashupPayment = _presetMashupPayment(bundle);

        if (_recipientMode == 'other') {
          _mashupStep = 'recipient_phone';
        } else if (_recipientMode == 'self') {
          _mashupStep = tierId == 'ghc30' ? 'review' : 'allocation';
        } else {
          _mashupStep = 'recipient_mode';
        }

        return;
      }
    }
  }

  @override
  void initState() {
    super.initState();

    _selectedSimSlot = widget.simSlot;
    _applyInitialQuickActionPreset();
    _loadSimIdentity();
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

      final supported = <SimCard>[];

      for (final sim in detected) {
        if (sim.isMoMoSupported == false) {
          continue;
        }

        final purpose = await SimRoleAssignmentService.roleForSlot(
          sim.slot,
          refreshFromServer: true,
          simIccid: sim.iccid,
          simSubscriptionId: sim.subscriptionId,
          provider: sim.network,
        );

        if (purpose == 'subscriber') {
          supported.add(sim);
        }
      }

      supported.sort((a, b) => a.slot.compareTo(b.slot));

      if (mounted == false) {
        return;
      }

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

  Future<Map<String, dynamic>?> _withStableClientOperation(
    Map<String, dynamic> baseRequest,
  ) async {
    String installationId;

    try {
      installationId = await StorageService.getOrCreateInstallationId();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'AgentPro could not establish this device identity. Please try again.',
            ),
          ),
        );
      }
      return null;
    }

    final request = <String, dynamic>{
      ...baseRequest,
      'installation_id': installationId,
    };

    // Sorted JSON is only a local comparison key. The backend independently
    // creates the authoritative SHA-256 fingerprint.
    final canonicalSource = Map<String, dynamic>.from(request);

    final normalizedIccid =
        canonicalSource['sim_iccid']?.toString().trim() ?? '';

    if (normalizedIccid.isNotEmpty) {
      // ICCID + slot identifies the physical SIM. Do not split one
      // physical SIM merely because Android fallback metadata changes.
      canonicalSource['installation_id'] = '';
      canonicalSource['sim_subscription_id'] = null;
    }

    final canonical = SplayTreeMap<String, dynamic>.from(canonicalSource);
    final fingerprint = jsonEncode(canonical);

    if (_pendingClientOperationId == null ||
        _pendingClientOperationFingerprint != fingerprint) {
      _pendingClientOperationId = const Uuid().v4();
      _pendingClientOperationFingerprint = fingerprint;
    }

    request['client_operation_id'] = _pendingClientOperationId;
    return request;
  }

  void _resetClientOperationForNewAttempt() {
    _pendingClientOperationId = null;
    _pendingClientOperationFingerprint = null;
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

  void _showPersonalStartFailure(String message) {
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppTheme.errorColor),
    );
  }

  Future<String?> _startPreparedPersonalTransaction({
    required Map<String, dynamic> requestFields,
    required SimCard selectedSim,
    required String? displayAmount,
    required String? customerPhone,
  }) async {
    final transactionType =
        requestFields['transaction_type']?.toString().trim() ?? '';

    if (transactionType.isEmpty) {
      _showPersonalStartFailure('The transaction type is unavailable.');
      return null;
    }

    final bundleCategory = requestFields['bundle_category']?.toString().trim();

    final recipientMode = requestFields['recipient_mode']?.toString().trim();

    final selectionsInOrder = (requestFields['selections_in_order'] as List?)
            ?.map((value) => value.toString())
            .toList() ??
        const <String>[];

    try {
      final connectivity = await Connectivity().checkConnectivity();

      final isOffline = connectivity.isEmpty ||
          connectivity.every((result) => result == ConnectivityResult.none);

      Map<String, dynamic> transaction;

      if (isOffline) {
        final trust = await StorageService.evaluateOfflineTransactionTrust(
          isPersonal: true,
        );

        if (!trust.isValid) {
          _showPersonalStartFailure(
            'Offline transaction access needs a fresh server '
            'verification. Connect to the internet, open AgentPro, '
            'then try again.',
          );
          return null;
        }

        try {
          await OfflineQueueService.init();
        } catch (_) {
          _showPersonalStartFailure(
            'AgentPro could not open its offline transaction storage. '
            'Please restart the app and try again.',
          );
          return null;
        }

        final user = await StorageService.getUser();

        final identity = OfflineQueueService.identityFromUser(user);

        if (identity == null || user == null) {
          _showPersonalStartFailure(
            'Your authenticated account identity is unavailable. '
            'Connect to the internet and sign in again.',
          );
          return null;
        }

        Map<String, dynamic>? cachedFlow;

        try {
          cachedFlow = OfflineQueueService.getCachedFlow(
            widget.provider,
            transactionType,
            identity: identity,
            isPersonal: true,
            bundleCategory: bundleCategory == null || bundleCategory.isEmpty
                ? null
                : bundleCategory,
            recipientMode: recipientMode == null || recipientMode.isEmpty
                ? null
                : recipientMode,
          );
        } catch (_) {
          cachedFlow = null;
        }

        if (cachedFlow == null) {
          _showPersonalStartFailure(
            'This Quick Action has not been prepared for offline use yet. '
            'Connect to the internet, open Personal Home, and try again.',
          );
          return null;
        }

        final ownerUserId =
            cachedFlow['owner_user_id']?.toString().trim() ?? '';

        final companyId = cachedFlow['company_id']?.toString().trim() ?? '';

        // A Personal offline cache must never contain a company-owned flow.
        if (companyId.isNotEmpty) {
          _showPersonalStartFailure(
            'The cached USSD configuration does not belong to Personal mode. '
            'Connect to the internet to refresh it.',
          );
          return null;
        }

        final isPersonalOverride = ownerUserId.isNotEmpty;

        if (isPersonalOverride &&
            (ownerUserId != identity.userId ||
                !trust.hasPersonalPaidEntitlement)) {
          _showPersonalStartFailure(
            'This cached Personal override can no longer be verified for '
            'offline use. Connect to the internet to refresh your plan '
            'and USSD configuration.',
          );
          return null;
        }

        final localId = 'local_${const Uuid().v4()}';

        transaction = <String, dynamic>{
          'transaction_id': localId,
          'reference': localId,
          'status': 'initiated',
          'provider': widget.provider,
          'transaction_type': transactionType,

          // The cached resolver result was previously returned by the
          // authenticated Personal resolver. Global flows are available
          // to every Personal account. Personal-owned flows additionally
          // require the server-issued Paid entitlement in the current
          // session-bound Personal offline trust proof.
          'automation_entitled': true,
          'personal_override_entitled': isPersonalOverride,
          'manual_dial_code': null,

          'automation_params': {
            'amount': requestFields['amount']?.toString() ?? '',
            'customer_phone':
                requestFields['recipient_phone']?.toString() ?? '',
            'recipient_phone':
                requestFields['recipient_phone']?.toString() ?? '',
            'payment_reference': requestFields['notes']?.toString() ?? '',
            'merchant_id': requestFields['merchant_id']?.toString() ?? '',
          },

          // TransactionProgressScreen treats an explicitly supplied,
          // identity-scoped cached flow as the genuine offline path and
          // validates it again immediately before native execution.
          'cached_flow': cachedFlow,
        };
      } else {
        final response = await ApiClient.instance.post(
          '/personal-transactions',
          data: requestFields,
        );

        final rawTransaction = response.data['data'];

        if (rawTransaction is! Map) {
          throw const FormatException(
            'Invalid personal transaction initiation response',
          );
        }

        transaction = Map<String, dynamic>.from(rawTransaction);
      }

      if (!mounted) return null;

      return context.push<String>(
        '/transactions/progress',
        extra: {
          'is_personal': true,
          'transaction': transaction,
          'provider': widget.provider,
          'transaction_type': transactionType,
          if (bundleCategory != null && bundleCategory.isNotEmpty)
            'bundle_category': bundleCategory,
          if (recipientMode != null && recipientMode.isNotEmpty)
            'recipient_mode': recipientMode,
          'selections_in_order': selectionsInOrder,
          'amount': displayAmount,
          'customer_phone': customerPhone,
          'sim_slot': selectedSim.slot,
          'sim_iccid': selectedSim.iccid.isNotEmpty ? selectedSim.iccid : null,
          'sim_subscription_id': selectedSim.subscriptionId,
          'request_fields': requestFields,
        },
      );
    } on DioException catch (error) {
      final responseData = error.response?.data;

      final message =
          responseData is Map ? responseData['message']?.toString() : null;

      _showPersonalStartFailure(
        message ?? 'Failed to start transaction. Please try again.',
      );

      return null;
    } on FormatException catch (error) {
      _showPersonalStartFailure(error.message);
      return null;
    } catch (_) {
      _showPersonalStartFailure(
        'The transaction could not be started. Please try again.',
      );
      return null;
    }
  }

  Future<void> _submit() async {
    if (_isMtnMashup) {
      await _submitMtnMashup();
      return;
    }

    if (_isDataBundle) {
      await _submitDataBundle();
      return;
    }

    if (!_formKey.currentState!.validate()) return;

    if (!_simDetectionComplete) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('SIM detection is still in progress.')),
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

    final baseRequestFields = <String, dynamic>{
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
      if (_isMtnCrossNetwork && _crossNetworkSelection != null)
        'selections_in_order': <String>[_crossNetworkSelection!],
    };

    final requestFields = await _withStableClientOperation(baseRequestFields);

    if (requestFields == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }

    progressAction = await _startPreparedPersonalTransaction(
      requestFields: requestFields,
      selectedSim: selectedSim,
      displayAmount: _needsAmount ? _amountCtrl.text.trim() : null,
      customerPhone: _needsPhone ? _phoneCtrl.text.trim() : null,
    );

    if (mounted) {
      setState(() => _loading = false);
    }

    if (mounted && progressAction == 'retry_now') {
      _resetClientOperationForNewAttempt();
      await _submit();
    } else if (mounted && progressAction == 'edit_retry') {
      _resetClientOperationForNewAttempt();
    }
  }

  Future<void> _submitDataBundle() async {
    if (!_simDetectionComplete) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('SIM detection is still in progress.')),
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

    final resolvedBundleCategory = _isMtnDataBundle &&
            _bundleCategory != null &&
            _flexiPayment != null
        ? '${_bundleCategory}_${_flexiPayment!.digit == '1' ? 'airtime' : 'momo'}'
        : _bundleCategory;

    final baseRequestFields = <String, dynamic>{
      'provider': widget.provider,
      'transaction_type': widget.transactionType,
      'bundle_category': resolvedBundleCategory,
      'recipient_mode': _recipientMode,
      if (recipientPhone != null) 'recipient_phone': recipientPhone,
      if (flexiAmount != null) 'amount': double.tryParse(flexiAmount),
      if (selectedSim.iccid.isNotEmpty) 'sim_iccid': selectedSim.iccid,
      'sim_slot': selectedSim.slot,
      'sim_subscription_id': selectedSim.subscriptionId,
      'selections_in_order': _computeSelections(),
    };

    final requestFields = await _withStableClientOperation(baseRequestFields);

    if (requestFields == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }

    progressAction = await _startPreparedPersonalTransaction(
      requestFields: requestFields,
      selectedSim: selectedSim,
      displayAmount: flexiAmount,
      customerPhone: recipientPhone,
    );

    if (mounted) {
      setState(() => _loading = false);
    }

    if (mounted && progressAction == 'retry_now') {
      _resetClientOperationForNewAttempt();
      await _submitDataBundle();
    } else if (mounted && progressAction == 'edit_retry') {
      _resetClientOperationForNewAttempt();
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = kPersonalTransactionLabels[widget.transactionType] ??
        widget.transactionType;
    final appBarLabel = switch (widget.transactionType) {
      'send_money_same_network' => 'Transfer Money',
      'send_money_cross_network' => 'Transfer Money',
      _ => label,
    };

    return Scaffold(
      appBar: AppBar(title: Text(appBarLabel)),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            _buildLockedSimSection(context),
            const SizedBox(height: 16),
            Expanded(
              child: _isMtnMashup
                  ? _buildMtnMashupFlow(context)
                  : _isDataBundle
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
            style: const TextStyle(fontWeight: FontWeight.w600),
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
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: sims.map((sim) {
              final isSelected = selected?.slot == sim.slot;
              final color = AppTheme.providerColor(widget.provider);

              final iccid = sim.iccid.trim();
              final tail = iccid.isEmpty
                  ? ''
                  : iccid.substring(iccid.length > 6 ? iccid.length - 6 : 0);

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
                  value == null ? 'Choose how to transfer money' : null,
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
                DropdownMenuItem<String>(value: 'self', child: Text('Myself')),
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

  String? _mashupBundleCategory() {
    final tier = _mashupTier;
    final payment = _mashupPayment;
    if (tier == null || payment == null) return null;

    final paymentKey = payment.digit == '1' ? 'airtime' : 'momo';

    if (tier.id == 'ghc30') {
      return '${tier.id}_$paymentKey';
    }

    // MTN accepts allocation digits 1-5 directly from the first
    // allocation response, even when option 5 is visually shown after
    // "99. More". Keep using the existing page1 flow identity so old
    // deployed flow rows remain compatible.
    return '${tier.id}_page1_$paymentKey';
  }

  Widget _buildMtnMashupFlow(BuildContext context) {
    switch (_mashupStep) {
      case 'recipient_mode':
        return ListView(
          children: [
            Text(
              'Who is this MashUp for?',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              'AgentPro will navigate the MTN Pulse menu automatically.',
              style: TextStyle(color: context.appSecondaryText),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: _dbBigOption(
                    context,
                    'Myself',
                    Icons.person_outline,
                    () => setState(() {
                      _recipientMode = 'self';
                      _phoneCtrl.clear();
                      _mashupStep = 'tier';
                    }),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _dbBigOption(
                    context,
                    'Someone else',
                    Icons.people_outline,
                    () => setState(() {
                      _recipientMode = 'other';
                      _phoneCtrl.clear();
                      _mashupStep = 'recipient_phone';
                    }),
                  ),
                ),
              ],
            ),
          ],
        );

      case 'recipient_phone':
        return ListView(
          children: [
            _dbBack(() => setState(() => _mashupStep = 'recipient_mode')),
            Text(
              "Recipient's MTN number",
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              'MTN will ask for this number and then ask AgentPro to confirm it.',
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
                setState(() {
                  if (_mashupTier == null) {
                    _mashupStep = 'tier';
                  } else if (_mashupTier!.id == 'ghc30' &&
                      _mashupPayment != null) {
                    _mashupStep = 'review';
                  } else {
                    _mashupStep = 'allocation';
                  }
                });
              },
            ),
          ],
        );

      case 'tier':
        return ListView(
          children: [
            _dbBack(
              () => setState(
                () => _mashupStep = _recipientMode == 'other'
                    ? 'recipient_phone'
                    : 'recipient_mode',
              ),
            ),
            Text(
              'Choose MashUp amount',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              'Only live-confirmed fixed tiers are shown. Custom amount ranges are not guessed.',
              style: TextStyle(color: context.appSecondaryText),
            ),
            const SizedBox(height: 16),
            ...kMtnMashupTiers.map(
              (tier) => _dbOptionTile(
                DataBundleOption(tier.label, tier.digit),
                () => setState(() {
                  _mashupTier = tier;
                  _mashupAllocation = null;
                  _mashupPayment = null;
                  _mashupStep = tier.id == 'ghc30' ? 'payment' : 'allocation';
                }),
              ),
            ),
          ],
        );

      case 'allocation':
        final tier = _mashupTier;
        final options = tier == null
            ? const <DataBundleOption>[]
            : kMtnMashupAllocations[tier.id] ?? const <DataBundleOption>[];

        return ListView(
          children: [
            _dbBack(() => setState(() => _mashupStep = 'tier')),
            Text(
              'Choose data and minutes',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              '${tier?.label ?? 'MashUp'} allocation',
              style: TextStyle(color: context.appSecondaryText),
            ),
            const SizedBox(height: 16),
            ...options.map(
              (option) => _dbOptionTile(
                option,
                () => setState(() {
                  _mashupAllocation = option;

                  _mashupStep = _mashupPayment != null ? 'review' : 'payment';
                }),
              ),
            ),
          ],
        );

      case 'payment':
        return _dbSimpleChoiceStep(
          context,
          title: 'Payment method',
          subtitle: 'Choose how MTN should charge for the MashUp.',
          options: kMtnMashupPayment,
          onBack: () => setState(
            () => _mashupStep =
                _mashupTier?.id == 'ghc30' ? 'tier' : 'allocation',
          ),
          onPick: (option) => setState(() {
            _mashupPayment = option;
            _mashupStep = 'review';
          }),
        );

      case 'review':
        final recipient =
            _recipientMode == 'self' ? 'Myself' : _phoneCtrl.text.trim();
        final tier = _mashupTier;
        final allocation = _mashupAllocation;
        final payment = _mashupPayment;

        return ListView(
          children: [
            _dbBack(() => setState(() => _mashupStep = 'payment')),
            Text(
              'Review MashUp',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            _mashupReviewRow(context, 'Recipient', recipient),
            _mashupReviewRow(context, 'Amount', tier?.label ?? '—'),
            if (allocation != null)
              _mashupReviewRow(context, 'Bundle', allocation.label),
            _mashupReviewRow(context, 'Payment', payment?.label ?? '—'),
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.appSurface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: context.appDivider),
              ),
              child: Text(
                payment?.digit == '2'
                    ? 'AgentPro will automate the MTN Pulse menus and stop at the PIN prompt. Enter the PIN yourself on the network screen.'
                    : 'AgentPro will automate the MTN Pulse menus and classify the final MTN response.',
                style: TextStyle(fontSize: 12, color: context.appSecondaryText),
              ),
            ),
            const SizedBox(height: 20),
            AppButton(
              label: 'Start MashUp',
              onPressed: _submitMtnMashup,
              isLoading: _loading,
            ),
          ],
        );

      default:
        return const SizedBox.shrink();
    }
  }

  Widget _mashupReviewRow(BuildContext context, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 86,
            child: Text(
              label,
              style: TextStyle(
                color: context.appSecondaryText,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _submitMtnMashup() async {
    final tier = _mashupTier;
    final payment = _mashupPayment;
    final bundleCategory = _mashupBundleCategory();

    if (tier == null ||
        payment == null ||
        bundleCategory == null ||
        _recipientMode == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Complete the MashUp choices first.')),
      );
      return;
    }

    if (tier.id != 'ghc30' && _mashupAllocation == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a MashUp allocation.')),
      );
      return;
    }

    if (_recipientMode == 'other' && _phoneCtrl.text.trim().length < 9) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid recipient phone number.')),
      );
      return;
    }

    if (!_simDetectionComplete) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('SIM detection is still in progress.')),
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

    final baseRequestFields = <String, dynamic>{
      'provider': widget.provider,
      'transaction_type': widget.transactionType,
      'amount': tier.amount,
      'bundle_category': bundleCategory,
      'recipient_mode': _recipientMode,
      if (recipientPhone != null) 'recipient_phone': recipientPhone,
      if (selectedSim.iccid.isNotEmpty) 'sim_iccid': selectedSim.iccid,
      'sim_slot': selectedSim.slot,
      'sim_subscription_id': selectedSim.subscriptionId,
      'selections_in_order': <String>[
        if (_mashupAllocation != null) _mashupAllocation!.digit,
      ],
    };

    final requestFields = await _withStableClientOperation(baseRequestFields);

    if (requestFields == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }

    progressAction = await _startPreparedPersonalTransaction(
      requestFields: requestFields,
      selectedSim: selectedSim,
      displayAmount: tier.amount.toString(),
      customerPhone: recipientPhone,
    );

    if (mounted) {
      setState(() => _loading = false);
    }

    if (mounted && progressAction == 'retry_now') {
      _resetClientOperationForNewAttempt();
      await _submitMtnMashup();
    } else if (mounted && progressAction == 'edit_retry') {
      _resetClientOperationForNewAttempt();
    }
  }

  Widget _buildDataBundleFlow(BuildContext context) {
    switch (_dbStep) {
      case 'recipient_mode':
        return _dbRecipientModeStep(context);
      case 'recipient_phone':
        return _dbRecipientPhoneStep(context);
      case 'mtn_bundle':
        return _dbMtnBundleStep(context);
      case 'mtn_flexi_amount':
        return _dbMtnFlexiAmountStep(context);
      case 'mtn_payment':
        return _dbMtnPaymentStep(context);
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
                  _phoneCtrl.clear();
                  _dbStep = _isMtnDataBundle ? 'mtn_bundle' : 'category';
                });
              }),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _dbBigOption(context, 'Other', Icons.people_outline, () {
                setState(() {
                  _recipientMode = 'other';
                  _phoneCtrl.clear();
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
            setState(() {
              if (!_isMtnDataBundle) {
                _dbStep = 'category';
              } else if (_bundleCategory == 'flexi') {
                _dbStep = 'mtn_flexi_amount';
              } else {
                _dbStep = 'mtn_bundle';
              }
            });
          },
        ),
      ],
    );
  }

  Widget _dbMtnBundleStep(BuildContext context) {
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
          'Choose data bundle',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 4),
        Text(
          'Choose Flexi or one of the current MTN bundle amounts.',
          style: TextStyle(color: context.appSecondaryText),
        ),
        const SizedBox(height: 16),
        _dbOptionTile(
          const DataBundleOption('Flexi — choose any amount', '1'),
          () {
            setState(() {
              _bundleCategory = 'flexi';
              _bundleChoice = const DataBundleOption('Flexi Bundle', '1');
              _flexiPayment = null;
              _flexiAmountCtrl.clear();
              _dbStep = 'mtn_flexi_amount';
            });
          },
        ),
        const SizedBox(height: 8),
        Text(
          'Fixed bundles',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        ...kMtnDataPage1.map(
          (opt) => _dbOptionTile(opt, () {
            setState(() {
              final keepPresetPayment = (widget.initialBundleCategory ?? '')
                  .toLowerCase()
                  .startsWith('fixed_page1_');

              _bundleCategory = 'fixed_page1';
              _bundleChoice = opt;

              if (!keepPresetPayment) {
                _flexiPayment = null;
              }

              _dbStep = _flexiPayment != null ? 'review' : 'mtn_payment';
            });
          }),
        ),
        ...kMtnDataPage2.map(
          (opt) => _dbOptionTile(opt, () {
            setState(() {
              final keepPresetPayment = (widget.initialBundleCategory ?? '')
                  .toLowerCase()
                  .startsWith('fixed_page2_');

              _bundleCategory = 'fixed_page2';
              _bundleChoice = opt;

              if (!keepPresetPayment) {
                _flexiPayment = null;
              }

              _dbStep = _flexiPayment != null ? 'review' : 'mtn_payment';
            });
          }),
        ),
      ],
    );
  }

  Widget _dbMtnFlexiAmountStep(BuildContext context) {
    return ListView(
      children: [
        _dbBack(() => setState(() => _dbStep = 'mtn_bundle')),
        Text('Flexi amount', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          'MTN currently accepts GHS 0.03 – 399.',
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
            final amount = double.tryParse(_flexiAmountCtrl.text.trim());

            if (amount == null || amount < 0.03 || amount > 399) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Enter an amount between GHS 0.03 and 399'),
                ),
              );
              return;
            }

            setState(() {
              _dbStep = _flexiPayment != null ? 'review' : 'mtn_payment';
            });
          },
        ),
      ],
    );
  }

  Widget _dbMtnPaymentStep(BuildContext context) {
    return _dbSimpleChoiceStep(
      context,
      title: 'Payment method',
      subtitle: 'Choose how MTN should charge for the bundle.',
      options: kMtnDataPayment,
      onBack: () => setState(
        () => _dbStep =
            _bundleCategory == 'flexi' ? 'mtn_flexi_amount' : 'mtn_bundle',
      ),
      onPick: (option) => setState(() {
        _flexiPayment = option;
        _dbStep = 'review';
      }),
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
              if (!_isMtnDataBundle)
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
