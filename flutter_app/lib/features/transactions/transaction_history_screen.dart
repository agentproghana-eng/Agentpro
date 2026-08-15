import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/utils/transaction_labels.dart';
import '../../shared/widgets/app_widgets.dart';
import '../../core/services/sim_card_service.dart';

// Full transaction history: Type and Provider are standalone filters
// (each independently narrows the list), Branch is an additional
// standalone filter shown only to Owner/Manager (Agents only ever see
// their own transactions, so a branch picker is meaningless for them -
// backend already scopes it that way regardless). Sort is a separate
// control (Date/Amount/Commission/Transfer Charge, each ascending or
// descending) - deliberately NOT combined with Provider, since sorting
// alphabetically by provider name isn't a meaningful operation the way
// sorting by a numeric field is.
class TransactionHistoryScreen extends StatefulWidget {
  final String? initialBranchId;

  const TransactionHistoryScreen({
    super.key,
    this.initialBranchId,
  });

  @override
  State<TransactionHistoryScreen> createState() =>
      _TransactionHistoryScreenState();
}

class _TransactionHistoryScreenState extends State<TransactionHistoryScreen> {
  List<dynamic> _transactions = [];
  List<dynamic> _branches = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  int _page = 1;
  int _total = 0;
  String? _error;
  bool _showBranchFilter = false;
  bool _isAgent = false;
  List<SimCard> _simCards = [];
  String? _simIccidFilter;

  String _typeFilter = 'all';
  String _providerFilter = 'all';
  String? _branchFilter;
  String _sortBy = 'date';
  String _sortOrder = 'desc';
  String _statusFilter = 'all';
  DateTimeRange? _dateRange;
  final _searchController = TextEditingController();
  Timer? _searchDebounce;

  final _scrollController = ScrollController();

  final _types = const [
    {'value': 'all', 'label': 'All'},
    {'value': 'cash_in', 'label': 'Cash In'},
    {'value': 'cash_out', 'label': 'Cash Out'},
    {'value': 'float_received', 'label': 'Float Received'},
    {'value': 'send_money', 'label': 'Send'},
    {'value': 'airtime', 'label': 'Airtime'},
    {'value': 'data_bundle', 'label': 'Data'},
    {'value': 'merchant_payment', 'label': 'Merchant'},
    {'value': 'bill_payment', 'label': 'Pay to Agent'},
    {'value': 'balance_enquiry', 'label': 'Balance'},
    {'value': 'business_deposit', 'label': 'Business In'},
    {'value': 'business_withdrawal', 'label': 'Business Out'},
  ];

  final _statuses = const [
    {'value': 'all', 'label': 'All Statuses'},
    {'value': 'success', 'label': 'Successful'},
    {'value': 'failed', 'label': 'Failed'},
    {'value': 'pending_confirmation', 'label': 'Needs Verification'},
    {'value': 'processing', 'label': 'Processing'},
    {'value': 'initiated', 'label': 'Initiated'},
  ];
  final _providers = const [
    {'value': 'all', 'label': 'All'},
    {'value': 'mtn', 'label': 'MTN'},
    {'value': 'telecel', 'label': 'Telecel'},
    {'value': 'at_money', 'label': 'AT Money'},
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
    _branchFilter = widget.initialBranchId;
    _checkRoleForBranchFilter();
    _load();
    _loadSims();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      _loadMore();
    }
  }

  void _checkRoleForBranchFilter() {
    final state = context.read<AuthBloc>().state;
    if (state is AuthAuthenticated) {
      final role = state.user['role'];
      if (role == 'business_owner' || role == 'manager') {
        _showBranchFilter = true;
        _loadBranches();
      }
      _isAgent = role == 'agent';
    }
  }

  Future<void> _loadBranches() async {
    try {
      final res = await ApiClient.instance.get('/branches');
      if (mounted) setState(() => _branches = res.data['data'] ?? []);
    } catch (_) {
      // Branch filter just won't show options - not worth blocking the
      // whole history screen over.
    }
  }

  // Mirrors the Home tab's SIM-detection pattern: retry once if every
  // provider comes back null (Android can briefly report "no SIMs" at
  // cold launch), and never block the screen on detection failure -
  // _simMap stays null and the UI falls back to showing all provider
  // pills. _simCards holds the raw per-slot list (used for the SIM
  // filter, which distinguishes two physical SIMs on the same network -
  // something the provider-level map can't do).
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
        _simCards = cards.where((c) => c.iccid.isNotEmpty).toList();
      });
    } catch (_) {
      // Permission denied or detection failed - leave _simMap null and
      // _simCards empty so both filters gracefully fall back / hide.
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

  Map<String, dynamic> _buildQueryParams({required int page}) {
    return {
      'page': page,
      'limit': 20,
      'sort_by': _sortBy,
      'sort_order': _sortOrder,
      if (_typeFilter != 'all') 'transaction_type': _typeFilter,
      if (_providerFilter != 'all') 'provider': _providerFilter,
      if (_simIccidFilter != null) 'sim_iccid': _simIccidFilter,
      if (_branchFilter != null) 'branch_id': _branchFilter,
      if (_statusFilter != 'all') 'status': _statusFilter,
      if (_searchController.text.trim().isNotEmpty)
        'search': _searchController.text.trim(),
      if (_dateRange != null)
        'from_date': DateTime(
          _dateRange!.start.year,
          _dateRange!.start.month,
          _dateRange!.start.day,
        ).toIso8601String(),
      if (_dateRange != null)
        'to_date': DateTime(
          _dateRange!.end.year,
          _dateRange!.end.month,
          _dateRange!.end.day,
          23,
          59,
          59,
          999,
        ).toIso8601String(),
    };
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _page = 1;
      _hasMore = true;
    });
    try {
      final res = await ApiClient.instance.get(
        '/transactions',
        queryParameters: _buildQueryParams(page: 1),
      );
      final data = (res.data['data'] as List?) ?? [];
      final meta = res.data['meta'] as Map<String, dynamic>?;
      if (mounted) {
        setState(() {
          final currentPage = (meta?['page'] as num?)?.toInt() ?? 1;
          final totalPages = (meta?['total_pages'] as num?)?.toInt() ?? 1;

          _transactions = data;
          _page = currentPage;
          _total = (meta?['total'] as num?)?.toInt() ?? data.length;
          _loading = false;
          _hasMore = currentPage < totalPages;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Failed to load transactions';
          _loading = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    final nextPage = _page + 1;
    try {
      final res = await ApiClient.instance.get(
        '/transactions',
        queryParameters: _buildQueryParams(page: nextPage),
      );
      final data = (res.data['data'] as List?) ?? [];
      final meta = res.data['meta'] as Map<String, dynamic>?;
      if (mounted) {
        setState(() {
          final currentPage = (meta?['page'] as num?)?.toInt() ?? nextPage;
          final totalPages =
              (meta?['total_pages'] as num?)?.toInt() ?? currentPage;

          _transactions.addAll(data);
          _page = currentPage;
          _total = (meta?['total'] as num?)?.toInt() ?? _total;
          _loadingMore = false;
          _hasMore = currentPage < totalPages;
        });
      }
    } catch (_) {
      if (!mounted) return;

      setState(() => _loadingMore = false);

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Could not load more transactions. Pull down to retry.',
          ),
        ),
      );
    }
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 450), () {
      if (mounted) _load();
    });
    setState(() {});
  }

  int get _activeFilterCount {
    var count = 0;
    if (_statusFilter != 'all') count++;
    if (_dateRange != null) count++;
    if (_typeFilter != 'all') count++;
    if (_providerFilter != 'all') count++;
    if (_simIccidFilter != null) count++;
    if (_branchFilter != null) count++;
    return count;
  }

  bool get _hasAnyFiltering =>
      _activeFilterCount > 0 || _searchController.text.trim().isNotEmpty;

  String get _dateRangeLabel {
    if (_dateRange == null) return 'Any date';

    final format = DateFormat('dd MMM');
    return '${format.format(_dateRange!.start)} – '
        '${format.format(_dateRange!.end)}';
  }

  void _clearAllFilters() {
    _searchDebounce?.cancel();
    _searchController.clear();

    setState(() {
      _typeFilter = 'all';
      _providerFilter = 'all';
      _statusFilter = 'all';
      _simIccidFilter = null;
      _branchFilter = null;
      _dateRange = null;
      _sortBy = 'date';
      _sortOrder = 'desc';
    });

    _load();
  }

  Future<void> _showAdvancedFilters() async {
    var tempStatus = _statusFilter;
    var tempRange = _dateRange;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) {
          Future<void> chooseDateRange() async {
            final now = DateTime.now();
            final result = await showDateRangePicker(
              context: sheetContext,
              firstDate: DateTime(now.year - 3),
              lastDate: now,
              initialDateRange: tempRange,
              helpText: 'Filter transactions by date',
            );

            if (result != null) {
              setSheetState(() => tempRange = result);
            }
          }

          return SafeArea(
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                18,
                18,
                18,
                18 + MediaQuery.of(sheetContext).viewInsets.bottom,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Filter Transactions',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(sheetContext),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'STATUS',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.7,
                    ),
                  ),
                  const SizedBox(height: 7),
                  Wrap(
                    spacing: 7,
                    runSpacing: 7,
                    children: _statuses.map((status) {
                      final selected = tempStatus == status['value'];

                      return ChoiceChip(
                        label: Text(status['label']!),
                        selected: selected,
                        onSelected: (_) =>
                            setSheetState(() => tempStatus = status['value']!),
                        selectedColor:
                            AppTheme.primaryColor.withValues(alpha: 0.16),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 18),
                  const Text(
                    'DATE RANGE',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.7,
                    ),
                  ),
                  const SizedBox(height: 7),
                  InkWell(
                    onTap: chooseDateRange,
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: context.appSurface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color:
                              context.appSecondaryText.withValues(alpha: 0.16),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.date_range_outlined,
                            color: AppTheme.primaryColor,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              tempRange == null
                                  ? 'Any date'
                                  : '${DateFormat('dd MMM yyyy').format(tempRange!.start)}'
                                      ' – '
                                      '${DateFormat('dd MMM yyyy').format(tempRange!.end)}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          if (tempRange != null)
                            IconButton(
                              tooltip: 'Clear dates',
                              onPressed: () =>
                                  setSheetState(() => tempRange = null),
                              icon: const Icon(Icons.close, size: 18),
                            )
                          else
                            const Icon(Icons.chevron_right),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton.icon(
                    onPressed: () {
                      setState(() {
                        _statusFilter = tempStatus;
                        _dateRange = tempRange;
                      });
                      Navigator.pop(sheetContext);
                      _load();
                    },
                    icon: const Icon(Icons.check),
                    label: const Text('Apply Filters'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
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
                  _load();
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

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  // colorFor is optional so only the Provider filter (the one call
  // site that passes it) gets brand-color highlighting - Type and SIM
  // filters keep the generic teal, since their option values aren't
  // provider codes.
  Widget _filterPillRow(
    List<Map<String, String>> options,
    String current,
    void Function(String) onSelect, {
    Color Function(String)? colorFor,
    bool scrollable = false,
  }) {
    Widget buildPill(Map<String, String> opt) {
      final selected = current == opt['value'];
      final color =
          colorFor != null ? colorFor(opt['value']!) : AppTheme.primaryColor;

      return GestureDetector(
        onTap: () => onSelect(opt['value']!),
        child: Container(
          margin: const EdgeInsets.only(right: 6),
          padding: EdgeInsets.symmetric(
            horizontal: scrollable ? 12 : 4,
            vertical: 7,
          ),
          constraints: scrollable ? const BoxConstraints(minWidth: 52) : null,
          decoration: BoxDecoration(
            color: selected ? color : context.appSurface,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            opt['label']!,
            maxLines: 1,
            softWrap: false,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: selected
                  ? (color == AppTheme.mtnColor ? Colors.black : Colors.white)
                  : context.appSecondaryText,
            ),
          ),
        ),
      );
    }

    if (scrollable) {
      return SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: options.map(buildPill).toList(),
        ),
      );
    }

    return Row(
      children: options
          .map(
            (opt) => Expanded(
              child: buildPill(opt),
            ),
          )
          .toList(),
    );
  }

  Widget _filterSectionLabel(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
        child: Text(
          text,
          style: TextStyle(
            fontSize: 9,
            fontWeight: FontWeight.bold,
            color: context.appSecondaryText,
            letterSpacing: 0.5,
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Transaction History')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
            child: TextField(
              controller: _searchController,
              onChanged: _onSearchChanged,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search phone, customer or reference',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchController.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        onPressed: () {
                          _searchDebounce?.cancel();
                          _searchController.clear();
                          setState(() {});
                          _load();
                        },
                        icon: const Icon(Icons.close),
                      ),
                filled: true,
                fillColor: context.appSurface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(13),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _showAdvancedFilters,
                    icon: const Icon(Icons.tune, size: 18),
                    label: Text(
                      _activeFilterCount == 0
                          ? 'Status & Date'
                          : 'Filters ($_activeFilterCount)',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _showSortSheet,
                    icon: const Icon(Icons.swap_vert, size: 18),
                    label: Text(_sortLabel()),
                  ),
                ),
                if (_activeFilterCount > 0 ||
                    _searchController.text.isNotEmpty) ...[
                  const SizedBox(width: 4),
                  IconButton(
                    tooltip: 'Clear all filters',
                    onPressed: _clearAllFilters,
                    icon: const Icon(Icons.filter_alt_off_outlined),
                  ),
                ],
              ],
            ),
          ),
          if (_statusFilter != 'all' || _dateRange != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 2, 12, 4),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (_statusFilter != 'all')
                      InputChip(
                        label: Text(
                          _statuses.firstWhere(
                            (item) => item['value'] == _statusFilter,
                          )['label']!,
                        ),
                        onDeleted: () {
                          setState(() => _statusFilter = 'all');
                          _load();
                        },
                      ),
                    if (_dateRange != null)
                      InputChip(
                        label: Text(_dateRangeLabel),
                        onDeleted: () {
                          setState(() => _dateRange = null);
                          _load();
                        },
                      ),
                  ],
                ),
              ),
            ),
          _filterSectionLabel('TYPE'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: _filterPillRow(
              _types,
              _typeFilter,
              (v) {
                setState(() => _typeFilter = v);
                _load();
              },
              scrollable: true,
            ),
          ),
          _filterSectionLabel('PROVIDER'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: _filterPillRow(
              _providers,
              _providerFilter,
              (v) {
                setState(() => _providerFilter = v);
                _load();
              },
              colorFor: AppTheme.providerColor,
            ),
          ),
          if (_isAgent && _simCards.length >= 2) ...[
            _filterSectionLabel('SIM'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: _filterPillRow(
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
                (v) {
                  setState(() => _simIccidFilter = v == 'all' ? null : v);
                  _load();
                },
                scrollable: true,
              ),
            ),
          ],
          if (_showBranchFilter && _branches.isNotEmpty) ...[
            _filterSectionLabel('BRANCH'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: context.appSurface,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String?>(
                    value: _branchFilter,
                    isExpanded: true,
                    hint: const Text(
                      'All Branches',
                      style: TextStyle(fontSize: 12),
                    ),
                    items: [
                      const DropdownMenuItem<String?>(
                        value: null,
                        child: Text(
                          'All Branches',
                          style: TextStyle(fontSize: 12),
                        ),
                      ),
                      for (final b in _branches)
                        DropdownMenuItem<String?>(
                          value: b['id'] as String,
                          child: Text(
                            b['name'] ?? '',
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),
                    ],
                    onChanged: (v) {
                      setState(() => _branchFilter = v);
                      _load();
                    },
                  ),
                ),
              ),
            ),
          ],
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                _loading
                    ? 'Loading transactions…'
                    : '$_total ${_total == 1 ? 'transaction' : 'transactions'}',
                style: TextStyle(
                  fontSize: 12,
                  color: context.appSecondaryText,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null && _transactions.isEmpty
                    ? _BusinessHistoryErrorState(onRetry: _load)
                    : _transactions.isEmpty
                        ? _BusinessHistoryEmptyState(
                            filtered: _hasAnyFiltering,
                            onClear: _clearAllFilters,
                          )
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.builder(
                              controller: _scrollController,
                              physics: const AlwaysScrollableScrollPhysics(),
                              padding: const EdgeInsets.all(12),
                              itemCount:
                                  _transactions.length + (_hasMore ? 1 : 0),
                              itemBuilder: (_, i) {
                                if (i >= _transactions.length) {
                                  return const Padding(
                                    padding: EdgeInsets.all(16),
                                    child: Center(
                                      child: CircularProgressIndicator(),
                                    ),
                                  );
                                }
                                final tx =
                                    _transactions[i] as Map<String, dynamic>;
                                return _TransactionRow(tx: tx);
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

class _BusinessHistoryErrorState extends StatelessWidget {
  final Future<void> Function() onRetry;

  const _BusinessHistoryErrorState({
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.cloud_off_outlined,
              size: 46,
              color: context.appSecondaryText,
            ),
            const SizedBox(height: 14),
            const Text(
              'Could not load transactions',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Please check your connection and try again.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: context.appSecondaryText,
              ),
            ),
            const SizedBox(height: 18),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _BusinessHistoryEmptyState extends StatelessWidget {
  final bool filtered;
  final VoidCallback onClear;

  const _BusinessHistoryEmptyState({
    required this.filtered,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              filtered ? Icons.search_off_rounded : Icons.receipt_long_outlined,
              size: 48,
              color: context.appSecondaryText,
            ),
            const SizedBox(height: 14),
            Text(
              filtered ? 'No matching transactions' : 'No transactions yet',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              filtered
                  ? 'Try changing your search or filters.'
                  : 'Transactions will appear here once activity is recorded.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: context.appSecondaryText,
              ),
            ),
            if (filtered) ...[
              const SizedBox(height: 16),
              TextButton.icon(
                onPressed: onClear,
                icon: const Icon(Icons.filter_alt_off_outlined),
                label: const Text('Clear filters'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _TransactionRow extends StatelessWidget {
  final Map<String, dynamic> tx;
  const _TransactionRow({required this.tx});

  @override
  Widget build(BuildContext context) {
    final type = (tx['transaction_type'] ?? '').toString();
    final isIncoming = type == 'cash_in' || type == 'float_received';
    final amount = double.tryParse(tx['amount']?.toString() ?? '0') ?? 0;
    final commission = tx['net_commission'] != null
        ? double.tryParse(tx['net_commission'].toString())
        : null;
    final fee =
        tx['fee'] != null ? double.tryParse(tx['fee'].toString()) : null;
    DateTime? created;
    try {
      created = DateTime.parse(tx['created_at'].toString());
    } catch (_) {}
    final dateStr = created != null
        ? DateFormat('dd MMM, HH:mm').format(created.toLocal())
        : '';

    final subParts = <String>[];
    if (tx['customer_phone'] != null) {
      subParts.add(tx['customer_phone'].toString());
    }
    subParts.add(dateStr);
    if (commission != null && commission > 0) {
      subParts.add('Comm. GH₵${commission.toStringAsFixed(2)}');
    }
    if (fee != null && fee > 0) {
      subParts.add('Charge GH₵${fee.toStringAsFixed(2)}');
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: AppTheme.providerColor(
            tx['provider'] ?? '',
          ).withValues(alpha: 0.15),
          child: Icon(
            isIncoming ? Icons.call_received : Icons.call_made,
            color: AppTheme.providerColor(tx['provider'] ?? ''),
          ),
        ),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              transactionTypeLabel(
                type,
                (tx['provider'] ?? '').toString(),
              ),
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            ),
            const SizedBox(width: 6),
            ProviderBadge(provider: tx['provider'] ?? ''),
          ],
        ),
        subtitle: Text(
          subParts.join(' · '),
          style: const TextStyle(fontSize: 11),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            GhsAmount(amount: amount, fontSize: 13),
            const SizedBox(height: 2),
            StatusBadge(status: tx['status'] ?? ''),
          ],
        ),
        onTap: () => context.push('/transactions/${tx['id']}'),
      ),
    );
  }
}
