// reports_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/api/api_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:async';
import 'dart:io';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});
  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  String _period = 'month';
  String _format = 'pdf';
  bool _loading = false;

  Timer? _countDebounce;
  int _countRequestId = 0;
  int? _matchingTransactionCount;
  bool _loadingMatchCount = false;

  bool _loadingBranches = true;
  List<dynamic> _branches = [];
  String? _branchId;

  bool _loadingAgents = true;
  List<dynamic> _agents = [];
  String? _agentId;

  bool _isAgent = false;
  Map<String, SimCard?>? _simMap;
  List<SimCard> _simCards = [];
  String? _simIccidFilter;

  final Set<String> _typeFilters = {};
  final Set<String> _providerFilters = {};
  final Set<String> _statusFilters = {};
  String _sortBy = 'date';
  String _sortOrder = 'desc';

  final _providers = const [
    {'value': 'all', 'label': 'All'},
    {'value': 'mtn', 'label': 'MTN'},
    {'value': 'telecel', 'label': 'Telecel'},
    {'value': 'at_money', 'label': 'AT Money'},
  ];

  // Matches the transaction_type Postgres enum exactly (migrations 001
  // and 011) - there is no separate "cash out commission" type, only
  // cash_in_commission exists today.
  final _types = const [
    {'value': 'all', 'label': 'All'},
    {'value': 'cash_in', 'label': 'Cash In'},
    {'value': 'cash_out', 'label': 'Cash Out'},
    {'value': 'send_money', 'label': 'Send Money'},
    {'value': 'merchant_payment', 'label': 'Merchant Payment'},
    {'value': 'bill_payment', 'label': 'Pay to Agent'},
    {'value': 'airtime', 'label': 'Airtime'},
    {'value': 'data_bundle', 'label': 'Data Bundle'},
    {'value': 'balance_enquiry', 'label': 'Balance Enquiry'},
    {'value': 'mini_statement', 'label': 'Mini Statement'},
    {'value': 'reversal', 'label': 'Reversal'},
    {'value': 'commission_balance', 'label': 'Commission Balance'},
    {'value': 'cash_in_commission', 'label': 'Cash In Commission'},
    {'value': 'commission_transfer', 'label': 'Commission Transfer'},
  ];

  final _statuses = const [
    {'value': 'all', 'label': 'All'},
    {'value': 'success', 'label': 'Success'},
    {'value': 'failed', 'label': 'Failed'},
    {'value': 'initiated', 'label': 'Initiated'},
    {'value': 'processing', 'label': 'Processing'},
    {'value': 'pending_confirmation', 'label': 'Pending Confirmation'},
    {'value': 'reversed', 'label': 'Reversed'},
  ];

  final _sortOptions = const [
    {'value': 'date', 'label': 'Date'},
    {'value': 'amount', 'label': 'Amount'},
    {'value': 'commission', 'label': 'Commission'},
    {'value': 'fee', 'label': 'Transfer Charges'},
  ];

  @override
  void initState() {
    super.initState();
    final role =
        (context.read<AuthBloc>().state as AuthAuthenticated).user['role'];
    _isAgent = role == 'agent';
    _loadBranches();
    _loadAgents();
    if (_isAgent) _loadSims();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduleMatchCount(immediate: true);
    });
  }

  @override
  void dispose() {
    _countDebounce?.cancel();
    super.dispose();
  }

  Future<void> _loadBranches() async {
    // Only Owner/Manager have multiple branches to filter by - Agents
    // work a single branch and never see this dropdown at all.
    final role =
        (context.read<AuthBloc>().state as AuthAuthenticated).user['role'];
    if (role != 'business_owner' && role != 'manager') {
      setState(() => _loadingBranches = false);
      return;
    }
    try {
      final res = await ApiClient.instance.get('/branches');
      if (mounted) {
        setState(() {
          _branches = res.data['data'] ?? [];
          _loadingBranches = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingBranches = false);
    }
  }

  // Same role gating as the Branch picker above - an Agent's own
  // reports are already scoped to themselves server-side regardless,
  // so picking a different agent would be meaningless for that role.
  Future<void> _loadAgents() async {
    final role =
        (context.read<AuthBloc>().state as AuthAuthenticated).user['role'];
    if (role != 'business_owner' && role != 'manager') {
      setState(() => _loadingAgents = false);
      return;
    }
    try {
      final res = await ApiClient.instance.get(
        '/users',
        queryParameters: {'role': 'agent', 'limit': 200},
      );
      if (mounted) {
        setState(() {
          _agents = res.data['data'] ?? [];
          _loadingAgents = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingAgents = false);
    }
  }

  // Mirrors the Home tab's SIM-detection pattern: retry once if every
  // provider comes back null, and never block the screen on detection
  // failure - _simMap stays null so every provider is shown rather
  // than risk hiding a real option. Only called for the agent role -
  // an owner/manager's own phone SIMs have nothing to do with the
  // company-wide report they're generating.
  Future<void> _loadSims() async {
    try {
      var map = await SimCardService.getNetworkSimMap();
      if (map.values.every((v) => v == null)) {
        await Future.delayed(const Duration(milliseconds: 1200));
        if (!mounted) return;
        map = await SimCardService.getNetworkSimMap();
      }
      final cards = await SimCardService.getSimCards();
      if (!mounted) return;
      setState(() {
        _simMap = map;
        _simCards = cards.where((c) => c.iccid.isNotEmpty).toList();
        _providerFilters.removeWhere((provider) => map[provider] == null);
      });
    } catch (_) {
      // Permission denied or detection failed - leave _simMap null and
      // _simCards empty so both provider and SIM filters gracefully
      // fall back / hide.
    }
  }

  String _simNetworkLabel(String network) {
    switch (network) {
      case 'mtn':
        return 'MTN';
      case 'telecel':
        return 'Telecel';
      case 'at_money':
        return 'AT Money';
      default:
        return 'SIM';
    }
  }

  Future<void> _showSortSheet() async {
    String tempSortBy = _sortBy;
    String tempSortOrder = _sortOrder;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Sort By',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              RadioGroup<String>(
                groupValue: tempSortBy,
                onChanged: (value) {
                  if (value != null) {
                    setSheetState(() => tempSortBy = value);
                  }
                },
                child: Column(
                  children: [
                    for (final option in _sortOptions)
                      RadioListTile<String>(
                        value: option['value']!,
                        title: Text(option['label']!),
                        activeColor: AppTheme.primaryColor,
                        dense: true,
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Direction',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: ChoiceChip(
                      label: const Text('Ascending'),
                      selected: tempSortOrder == 'asc',
                      onSelected: (_) =>
                          setSheetState(() => tempSortOrder = 'asc'),
                      selectedColor:
                          AppTheme.primaryColor.withValues(alpha: 0.15),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ChoiceChip(
                      label: const Text('Descending'),
                      selected: tempSortOrder == 'desc',
                      onSelected: (_) =>
                          setSheetState(() => tempSortOrder = 'desc'),
                      selectedColor:
                          AppTheme.primaryColor.withValues(alpha: 0.15),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  setState(() {
                    _sortBy = tempSortBy;
                    _sortOrder = tempSortOrder;
                  });
                  Navigator.pop(ctx);
                },
                child: const Text('Apply'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _sortLabel() {
    final labels = {
      'date': 'Date',
      'amount': 'Amount',
      'commission': 'Commission',
      'fee': 'Charge',
    };
    final arrow = _sortOrder == 'asc' ? '↑' : '↓';
    return '${labels[_sortBy] ?? 'Date'} $arrow';
  }

  Map<String, dynamic> _transactionFilterParameters() {
    return {
      'period': _period,
      if (_branchId != null) 'branch_id': _branchId,
      if (_agentId != null) 'agent_id': _agentId,
      if (_providerFilters.isNotEmpty) 'provider': _providerFilters.join(','),
      if (_typeFilters.isNotEmpty) 'transaction_type': _typeFilters.join(','),
      if (_statusFilters.isNotEmpty) 'status': _statusFilters.join(','),
      if (_simIccidFilter != null) 'sim_iccid': _simIccidFilter,
    };
  }

  void _scheduleMatchCount({bool immediate = false}) {
    _countDebounce?.cancel();

    if (immediate) {
      _loadMatchCount();
      return;
    }

    _countDebounce = Timer(const Duration(milliseconds: 350), _loadMatchCount);
  }

  Future<void> _loadMatchCount() async {
    final requestId = ++_countRequestId;

    if (mounted) {
      setState(() => _loadingMatchCount = true);
    }

    try {
      final response = await ApiClient.instance.get(
        '/reports/transactions/count',
        queryParameters: _transactionFilterParameters(),
      );

      if (!mounted || requestId != _countRequestId) {
        return;
      }

      final rawCount = response.data['data']?['count'];
      final count = rawCount is int
          ? rawCount
          : int.tryParse(rawCount?.toString() ?? '') ?? 0;

      setState(() {
        _matchingTransactionCount = count;
        _loadingMatchCount = false;
      });
    } catch (_) {
      if (!mounted || requestId != _countRequestId) {
        return;
      }

      setState(() {
        _matchingTransactionCount = null;
        _loadingMatchCount = false;
      });
    }
  }

  void _setReportFilter(VoidCallback update) {
    setState(update);
    _scheduleMatchCount();
  }

  Future<void> _download(String type) async {
    setState(() => _loading = true);
    try {
      final isTx = type == 'transactions';
      final res = await ApiClient.instance.get(
        '/reports/$type',
        queryParameters: {
          'period': _period,
          'format': _format,
          if (_branchId != null) 'branch_id': _branchId,
          if (_agentId != null) 'agent_id': _agentId,
          if (_providerFilters.isNotEmpty)
            'provider': _providerFilters.join(','),
          if (isTx && _typeFilters.isNotEmpty)
            'transaction_type': _typeFilters.join(','),
          if (isTx && _statusFilters.isNotEmpty)
            'status': _statusFilters.join(','),
          if (isTx && _simIccidFilter != null) 'sim_iccid': _simIccidFilter,
          if (isTx) 'sort_by': _sortBy,
          if (isTx) 'sort_order': _sortOrder,
        },
        options: Options(responseType: ResponseType.bytes),
      );
      final dir = await getTemporaryDirectory();
      final ext = _format == 'excel' ? 'xlsx' : _format;
      final file = File(
        '${dir.path}/${type}_${DateTime.now().millisecondsSinceEpoch}.$ext',
      );
      await file.writeAsBytes(res.data);
      await OpenFile.open(file.path);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to generate report'),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600)),
      );

  Widget _chipRow(
    List<Map<String, String>> options,
    String current,
    void Function(String) onSelect,
  ) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final opt in options)
          ChoiceChip(
            label: Text(opt['label']!),
            selected: current == opt['value'],
            onSelected: (_) => onSelect(opt['value']!),
          ),
      ],
    );
  }

  Widget _multiChipRow(
    List<Map<String, String>> options,
    Set<String> selectedValues,
  ) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final option in options)
          Builder(
            builder: (context) {
              final value = option['value']!;
              final isAll = value == 'all';
              final isSelected = isAll
                  ? selectedValues.isEmpty
                  : selectedValues.contains(value);

              return FilterChip(
                label: Text(option['label']!),
                selected: isSelected,
                showCheckmark: true,
                onSelected: (_) {
                  _setReportFilter(() {
                    if (isAll) {
                      selectedValues.clear();
                      return;
                    }

                    if (!selectedValues.add(value)) {
                      selectedValues.remove(value);
                    }
                  });
                },
              );
            },
          ),
      ],
    );
  }

  String _optionLabel(List<Map<String, String>> options, String value) {
    for (final option in options) {
      if (option['value'] == value) {
        return option['label'] ?? value;
      }
    }

    return value;
  }

  bool get _hasActiveMultiFilters =>
      _typeFilters.isNotEmpty ||
      _providerFilters.isNotEmpty ||
      _statusFilters.isNotEmpty;

  void _clearMultiFilters() {
    _setReportFilter(() {
      _typeFilters.clear();
      _providerFilters.clear();
      _statusFilters.clear();
    });
  }

  Widget _activeFilterChips(BuildContext context) {
    final chips = <Widget>[];

    for (final type in _typeFilters) {
      chips.add(
        InputChip(
          avatar: const Icon(Icons.swap_horiz_rounded, size: 16),
          label: Text(_optionLabel(_types, type)),
          onDeleted: () {
            _setReportFilter(() => _typeFilters.remove(type));
          },
        ),
      );
    }

    for (final provider in _providerFilters) {
      chips.add(
        InputChip(
          avatar: const Icon(Icons.sim_card_outlined, size: 16),
          label: Text(_optionLabel(_providers, provider)),
          onDeleted: () {
            _setReportFilter(() => _providerFilters.remove(provider));
          },
        ),
      );
    }

    for (final status in _statusFilters) {
      chips.add(
        InputChip(
          avatar: const Icon(Icons.check_circle_outline_rounded, size: 16),
          label: Text(_optionLabel(_statuses, status)),
          onDeleted: () {
            _setReportFilter(() => _statusFilters.remove(status));
          },
        ),
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
      decoration: BoxDecoration(
        color: context.appSurface,
        borderRadius: BorderRadius.circular(14),
        border:
            Border.all(color: context.appSecondaryText.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.filter_alt_outlined,
                size: 18,
                color: AppTheme.primaryColor,
              ),
              const SizedBox(width: 7),
              const Expanded(
                child: Text(
                  'Active Filters',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                ),
              ),
              TextButton(
                onPressed: _clearMultiFilters,
                child: const Text('Clear All'),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Wrap(spacing: 8, runSpacing: 8, children: chips),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final showBranchPicker = !_loadingBranches && _branches.isNotEmpty;
    final showAgentPicker = !_loadingAgents && _agents.isNotEmpty;
    final noSimsDetected =
        _isAgent && _simMap != null && _simMap!.values.every((v) => v == null);
    final visibleProviders = _simMap == null
        ? _providers
        : _providers
            .where((p) => p['value'] == 'all' || _simMap![p['value']] != null)
            .toList();
    final showSimFilter = _isAgent && _simCards.length >= 2;

    return Scaffold(
      appBar: AppBar(title: const Text('Reports')),
      body: LoadingOverlay(
        isLoading: _loading,
        message: 'Generating report...',
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _sectionLabel('Period'),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final p in ['today', 'week', 'month', 'year'])
                          ChoiceChip(
                            label: Text(p[0].toUpperCase() + p.substring(1)),
                            selected: _period == p,
                            onSelected: (_) =>
                                _setReportFilter(() => _period = p),
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _sectionLabel('Type'),
                    _multiChipRow(_types, _typeFilters),
                    const SizedBox(height: 16),
                    _sectionLabel('Provider'),
                    if (noSimsDetected)
                      Text(
                        'No SIM card detected. Insert a SIM to filter by provider.',
                        style: TextStyle(
                          fontSize: 12,
                          color: context.appSecondaryText,
                        ),
                      )
                    else
                      _multiChipRow(visibleProviders, _providerFilters),
                    const SizedBox(height: 16),
                    if (showSimFilter) ...[
                      _sectionLabel('SIM'),
                      _chipRow(
                        [
                          {'value': 'all', 'label': 'All'},
                          for (final c in _simCards)
                            {
                              'value': c.iccid,
                              'label':
                                  'SIM ${c.slot + 1} · ${_simNetworkLabel(c.network)}',
                            },
                        ],
                        _simIccidFilter ?? 'all',
                        (v) => _setReportFilter(
                          () => _simIccidFilter = v == 'all' ? null : v,
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    _sectionLabel('Status'),
                    _multiChipRow(_statuses, _statusFilters),
                    const SizedBox(height: 16),
                    if (showAgentPicker) ...[
                      _sectionLabel('Agent'),
                      DropdownButtonFormField<String?>(
                        initialValue: _agentId,
                        decoration: InputDecoration(
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        hint: const Text('All Agents'),
                        items: [
                          const DropdownMenuItem<String?>(
                            value: null,
                            child: Text('All Agents'),
                          ),
                          for (final a in _agents)
                            DropdownMenuItem<String?>(
                              value: a['id'] as String,
                              child: Text(
                                '${a['first_name'] ?? ''} ${a['last_name'] ?? ''}'
                                    .trim(),
                              ),
                            ),
                        ],
                        onChanged: (v) => _setReportFilter(() => _agentId = v),
                      ),
                      const SizedBox(height: 16),
                    ],
                    if (showBranchPicker) ...[
                      _sectionLabel('Branch'),
                      DropdownButtonFormField<String?>(
                        initialValue: _branchId,
                        decoration: InputDecoration(
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        hint: const Text('All Branches'),
                        items: [
                          const DropdownMenuItem<String?>(
                            value: null,
                            child: Text('All Branches'),
                          ),
                          for (final b in _branches)
                            DropdownMenuItem<String?>(
                              value: b['id'] as String,
                              child: Text(b['name'] ?? ''),
                            ),
                        ],
                        onChanged: (v) => _setReportFilter(() => _branchId = v),
                      ),
                      const SizedBox(height: 16),
                    ],
                    _sectionLabel('Sort'),
                    InkWell(
                      onTap: _showSortSheet,
                      borderRadius: BorderRadius.circular(10),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: context.appDivider,
                          ),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(_sortLabel()),
                            const Icon(Icons.swap_vert, size: 18),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    _sectionLabel('Format'),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final f in ['pdf', 'excel', 'csv'])
                          ChoiceChip(
                            label: Text(f.toUpperCase()),
                            selected: _format == f,
                            onSelected: (_) => setState(() => _format = f),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            if (_hasActiveMultiFilters) ...[
              const SizedBox(height: 12),
              _activeFilterChips(context),
              const SizedBox(height: 8),
            ] else ...[
              const SizedBox(height: 12),
              Text(
                '${_period[0].toUpperCase()}${_period.substring(1)} · All filters',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: context.appSecondaryText,
                ),
              ),
              const SizedBox(height: 4),
            ],
            Text(
              'Type, Status, SIM, and Sort apply to the Transaction Report only.',
              style: TextStyle(
                fontSize: 11,
                color: context.appSecondaryText,
                fontStyle: FontStyle.italic,
              ),
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: context.appSurface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: context.appSecondaryText.withValues(alpha: 0.12),
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.manage_search_rounded,
                    color: AppTheme.primaryColor,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _loadingMatchCount
                          ? 'Checking matching transactions...'
                          : _matchingTransactionCount == null
                              ? 'Matching count unavailable'
                              : '$_matchingTransactionCount '
                                  '${_matchingTransactionCount == 1 ? 'transaction' : 'transactions'} '
                                  'match your filters',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (_loadingMatchCount)
                    const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            const SectionHeader(title: 'AVAILABLE REPORTS'),
            const SizedBox(height: 8),
            _ReportTile(
              icon: Icons.receipt_long_outlined,
              color: AppTheme.primaryColor,
              title: 'Transaction Report',
              subtitle: 'All transactions with status and amounts',
              onTap: () => _download('transactions'),
            ),
            _ReportTile(
              icon: Icons.payments_outlined,
              color: AppTheme.successColor,
              title: 'Commission Report',
              subtitle: 'Gross, provider share, and net commission',
              onTap: () => _download('commissions'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReportTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title, subtitle;
  final VoidCallback onTap;
  const _ReportTile({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.1),
          child: Icon(icon, color: color),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
        trailing: const Icon(
          Icons.download_outlined,
          color: AppTheme.primaryColor,
        ),
        onTap: onTap,
      ),
    );
  }
}
