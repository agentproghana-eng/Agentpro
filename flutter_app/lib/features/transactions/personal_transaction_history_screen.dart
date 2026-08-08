import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';
import '../../shared/widgets/personal_transaction_item.dart';

class PersonalTransactionHistoryScreen extends StatefulWidget {
  const PersonalTransactionHistoryScreen({super.key});

  @override
  State<PersonalTransactionHistoryScreen> createState() =>
      _PersonalTransactionHistoryScreenState();
}

class _PersonalTransactionHistoryScreenState
    extends State<PersonalTransactionHistoryScreen> {
  final ScrollController _scrollController = ScrollController();
  final TextEditingController _searchController = TextEditingController();

  Timer? _searchDebounce;

  List<dynamic> _transactions = [];

  int _page = 1;
  int _totalPages = 1;
  int _total = 0;

  bool _loading = true;
  bool _loadingMore = false;
  bool _refreshing = false;

  String? _error;

  String _providerFilter = 'all';
  String _typeFilter = 'all';
  String _statusFilter = 'all';

  String _sortBy = 'date';
  String _sortOrder = 'desc';

  DateTimeRange? _dateRange;

  static const _providers = [
    {'value': 'all', 'label': 'All Networks'},
    {'value': 'mtn', 'label': 'MTN'},
    {'value': 'telecel', 'label': 'Telecel'},
    {'value': 'at_money', 'label': 'AT Money'},
  ];

  static const _types = [
    {'value': 'all', 'label': 'All Types'},
    {'value': 'send_money_same_network', 'label': 'Send Money'},
    {'value': 'send_money_cross_network', 'label': 'Cross Network'},
    {'value': 'buy_airtime', 'label': 'Airtime'},
    {'value': 'buy_data', 'label': 'Data'},
    {'value': 'buy_mashup', 'label': 'MashUp'},
    {'value': 'check_momo_balance', 'label': 'MoMo Balance'},
    {'value': 'check_airtime_balance', 'label': 'Airtime Balance'},
    {'value': 'withdraw_cash', 'label': 'Withdraw Cash'},
  ];

  static const _statuses = [
    {'value': 'all', 'label': 'All Statuses'},
    {'value': 'success', 'label': 'Successful'},
    {'value': 'failed', 'label': 'Failed'},
    {'value': 'pending_confirmation', 'label': 'Needs Verification'},
    {'value': 'processing', 'label': 'Processing'},
    {'value': 'initiated', 'label': 'Initiated'},
  ];

  bool get _isPaid {
    final state = context.read<AuthBloc>().state;

    return state is AuthAuthenticated &&
        state.user['personal_subscription_plan'] == 'paid';
  }

  int get _activeFilterCount {
    var count = 0;

    if (_providerFilter != 'all') count++;
    if (_typeFilter != 'all') count++;
    if (_statusFilter != 'all') count++;
    if (_dateRange != null) count++;

    return count;
  }

  bool get _hasSearch => _searchController.text.trim().isNotEmpty;

  bool get _hasAnyFiltering => _activeFilterCount > 0 || _hasSearch;

  String get _dateLabel {
    final range = _dateRange;

    if (range == null) return 'Any date';

    final formatter = DateFormat('dd MMM');

    return '${formatter.format(range.start)} – '
        '${formatter.format(range.end)}';
  }

  @override
  void initState() {
    super.initState();

    _scrollController.addListener(_handleScroll);

    if (_isPaid) {
      _load();
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _handleScroll() {
    if (!_scrollController.hasClients) return;

    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 250) {
      _loadMore();
    }
  }

  Map<String, dynamic> _queryParameters(int page) {
    return {
      'page': page,
      'limit': 20,
      'sort_by': _sortBy,
      'sort_order': _sortOrder,
      if (_providerFilter != 'all') 'provider': _providerFilter,
      if (_typeFilter != 'all') 'transaction_type': _typeFilter,
      if (_statusFilter != 'all') 'status': _statusFilter,
      if (_hasSearch) 'search': _searchController.text.trim(),
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

  Future<void> _load({
    bool refreshing = false,
  }) async {
    if (!mounted) return;

    setState(() {
      _error = null;

      if (refreshing) {
        _refreshing = true;
      } else {
        _loading = true;
      }
    });

    try {
      final response = await ApiClient.instance.get(
        '/personal-transactions',
        queryParameters: _queryParameters(1),
      );

      final data = (response.data['data'] as List?) ?? const [];
      final meta = response.data['meta'] as Map<String, dynamic>?;

      if (!mounted) return;

      setState(() {
        _transactions = data;
        _page = 1;
        _totalPages = (meta?['total_pages'] as num?)?.toInt() ?? 1;
        _total = (meta?['total'] as num?)?.toInt() ?? data.length;
        _loading = false;
        _refreshing = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _error = 'Could not load your transaction history.';
        _loading = false;
        _refreshing = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loading || _loadingMore || _page >= _totalPages || !_isPaid) {
      return;
    }

    setState(() => _loadingMore = true);

    final nextPage = _page + 1;

    try {
      final response = await ApiClient.instance.get(
        '/personal-transactions',
        queryParameters: _queryParameters(nextPage),
      );

      final data = (response.data['data'] as List?) ?? const [];
      final meta = response.data['meta'] as Map<String, dynamic>?;

      if (!mounted) return;

      setState(() {
        _transactions.addAll(data);
        _page = nextPage;
        _totalPages = (meta?['total_pages'] as num?)?.toInt() ?? _totalPages;
        _total = (meta?['total'] as num?)?.toInt() ?? _total;
        _loadingMore = false;
      });
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

    setState(() {});

    _searchDebounce = Timer(
      const Duration(milliseconds: 450),
      () {
        if (mounted) _load();
      },
    );
  }

  void _clearSearch() {
    _searchDebounce?.cancel();
    _searchController.clear();
    setState(() {});
    _load();
  }

  void _clearFilters() {
    _searchDebounce?.cancel();
    _searchController.clear();

    setState(() {
      _providerFilter = 'all';
      _typeFilter = 'all';
      _statusFilter = 'all';
      _sortBy = 'date';
      _sortOrder = 'desc';
      _dateRange = null;
    });

    _load();
  }

  Future<void> _showFilters() async {
    var provider = _providerFilter;
    var type = _typeFilter;
    var status = _statusFilter;
    var range = _dateRange;

    final apply = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(24),
        ),
      ),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            Future<void> chooseDates() async {
              final now = DateTime.now();

              final selected = await showDateRangePicker(
                context: sheetContext,
                firstDate: DateTime(now.year - 3),
                lastDate: now,
                initialDateRange: range,
                helpText: 'Filter transaction history',
              );

              if (selected != null) {
                setSheetState(() => range = selected);
              }
            }

            Widget optionSection(
              String title,
              List<Map<String, String>> options,
              String selected,
              ValueChanged<String> onSelected,
            ) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.7,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 7,
                    runSpacing: 7,
                    children: options.map((option) {
                      final value = option['value']!;
                      final chosen = selected == value;

                      return ChoiceChip(
                        label: Text(option['label']!),
                        selected: chosen,
                        onSelected: (_) => onSelected(value),
                        selectedColor: AppTheme.primaryColor.withValues(
                          alpha: 0.16,
                        ),
                      );
                    }).toList(),
                  ),
                ],
              );
            }

            return Padding(
              padding: const EdgeInsets.fromLTRB(18, 14, 18, 22),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      width: 44,
                      height: 5,
                      margin: const EdgeInsets.only(
                        left: 140,
                        right: 140,
                        bottom: 14,
                      ),
                      decoration: BoxDecoration(
                        color: context.appSecondaryText.withValues(
                          alpha: 0.25,
                        ),
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Filter Transactions',
                            style: TextStyle(
                              fontSize: 18,
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
                    const SizedBox(height: 12),
                    optionSection(
                      'NETWORK',
                      _providers,
                      provider,
                      (value) => setSheetState(
                        () => provider = value,
                      ),
                    ),
                    const SizedBox(height: 22),
                    optionSection(
                      'TRANSACTION TYPE',
                      _types,
                      type,
                      (value) => setSheetState(
                        () => type = value,
                      ),
                    ),
                    const SizedBox(height: 22),
                    optionSection(
                      'STATUS',
                      _statuses,
                      status,
                      (value) => setSheetState(
                        () => status = value,
                      ),
                    ),
                    const SizedBox(height: 22),
                    const Text(
                      'DATE RANGE',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.7,
                      ),
                    ),
                    const SizedBox(height: 8),
                    InkWell(
                      onTap: chooseDates,
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 13,
                        ),
                        decoration: BoxDecoration(
                          color: context.appSurface,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: context.appSecondaryText.withValues(
                              alpha: 0.15,
                            ),
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
                                range == null
                                    ? 'Any date'
                                    : '${DateFormat('dd MMM yyyy').format(range!.start)}'
                                        ' – '
                                        '${DateFormat('dd MMM yyyy').format(range!.end)}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            if (range == null)
                              const Icon(Icons.chevron_right)
                            else
                              IconButton(
                                tooltip: 'Clear date range',
                                onPressed: () => setSheetState(
                                  () => range = null,
                                ),
                                icon: const Icon(
                                  Icons.close,
                                  size: 18,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton.icon(
                      onPressed: () => Navigator.pop(sheetContext, true),
                      icon: const Icon(Icons.check),
                      label: const Text('Apply Filters'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (apply != true || !mounted) return;

    setState(() {
      _providerFilter = provider;
      _typeFilter = type;
      _statusFilter = status;
      _dateRange = range;
    });

    _load();
  }

  Future<void> _showSort() async {
    var sortBy = _sortBy;
    var sortOrder = _sortOrder;

    final apply = await showModalBottomSheet<bool>(
      context: context,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(24),
        ),
      ),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            Widget option(
              String value,
              String order,
              String title,
              String subtitle,
              IconData icon,
            ) {
              final optionValue = '$value:$order';
              final selectedValue = '$sortBy:$sortOrder';
              final selected = optionValue == selectedValue;

              return RadioListTile<String>(
                value: optionValue,
                secondary: Icon(
                  icon,
                  color: selected
                      ? AppTheme.primaryColor
                      : context.appSecondaryText,
                ),
                title: Text(title),
                subtitle: Text(subtitle),
              );
            }

            return Padding(
              padding: const EdgeInsets.fromLTRB(10, 14, 10, 22),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Sort Transactions',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  RadioGroup<String>(
                    groupValue: '$sortBy:$sortOrder',
                    onChanged: (selectedValue) {
                      if (selectedValue == null) return;

                      final parts = selectedValue.split(':');

                      setSheetState(() {
                        sortBy = parts[0];
                        sortOrder = parts[1];
                      });
                    },
                    child: Column(
                      children: [
                        option(
                          'date',
                          'desc',
                          'Newest first',
                          'Most recent transactions at the top',
                          Icons.south_rounded,
                        ),
                        option(
                          'date',
                          'asc',
                          'Oldest first',
                          'Oldest transactions at the top',
                          Icons.north_rounded,
                        ),
                        option(
                          'amount',
                          'desc',
                          'Highest amount',
                          'Largest transaction amounts first',
                          Icons.trending_down_rounded,
                        ),
                        option(
                          'amount',
                          'asc',
                          'Lowest amount',
                          'Smallest transaction amounts first',
                          Icons.trending_up_rounded,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () => Navigator.pop(sheetContext, true),
                        child: const Text('Apply Sort'),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );

    if (apply != true || !mounted) return;

    setState(() {
      _sortBy = sortBy;
      _sortOrder = sortOrder;
    });

    _load();
  }

  Widget _paidGate() {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Transaction History'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.lock_outline,
                size: 48,
                color: AppTheme.primaryColor,
              ),
              const SizedBox(height: 16),
              const Text(
                'Full history is a Paid feature',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Upgrade your Personal plan to search, filter and '
                'review your complete transaction history.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: context.appSecondaryText,
                ),
              ),
              const SizedBox(height: 20),
              AppButton(
                label: 'Upgrade to Paid',
                onPressed: () => context.push('/personal-subscription'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _errorState() {
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
              _error ?? 'Please try again.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: context.appSecondaryText,
              ),
            ),
            const SizedBox(height: 18),
            ElevatedButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _emptyState() {
    final filtered = _hasAnyFiltering;

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
                  : 'Your completed Personal transactions will '
                      'appear here.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: context.appSecondaryText,
              ),
            ),
            if (filtered) ...[
              const SizedBox(height: 16),
              TextButton.icon(
                onPressed: _clearFilters,
                icon: const Icon(Icons.filter_alt_off_outlined),
                label: const Text('Clear filters'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_isPaid) {
      return _paidGate();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Transaction History'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
            child: TextField(
              controller: _searchController,
              onChanged: _onSearchChanged,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search reference, phone or notes',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _hasSearch
                    ? IconButton(
                        tooltip: 'Clear search',
                        onPressed: _clearSearch,
                        icon: const Icon(Icons.close),
                      )
                    : null,
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
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _showFilters,
                    icon: const Icon(Icons.tune_rounded),
                    label: Text(
                      _activeFilterCount == 0
                          ? 'Filters'
                          : 'Filters ($_activeFilterCount)',
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _showSort,
                    icon: const Icon(Icons.swap_vert_rounded),
                    label: const Text('Sort'),
                  ),
                ),
              ],
            ),
          ),
          if (_activeFilterCount > 0)
            SizedBox(
              height: 38,
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                scrollDirection: Axis.horizontal,
                children: [
                  if (_providerFilter != 'all')
                    _ActiveFilterChip(
                      label: _providers.firstWhere(
                        (p) => p['value'] == _providerFilter,
                      )['label']!,
                    ),
                  if (_typeFilter != 'all')
                    _ActiveFilterChip(
                      label: _types.firstWhere(
                        (p) => p['value'] == _typeFilter,
                      )['label']!,
                    ),
                  if (_statusFilter != 'all')
                    _ActiveFilterChip(
                      label: _statuses.firstWhere(
                        (p) => p['value'] == _statusFilter,
                      )['label']!,
                    ),
                  if (_dateRange != null)
                    _ActiveFilterChip(
                      label: _dateLabel,
                    ),
                  TextButton(
                    onPressed: _clearFilters,
                    child: const Text('Clear'),
                  ),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Row(
              children: [
                Text(
                  _loading
                      ? 'Loading transactions…'
                      : '$_total ${_total == 1 ? 'transaction' : 'transactions'}',
                  style: TextStyle(
                    fontSize: 12,
                    color: context.appSecondaryText,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (_refreshing) ...[
                  const SizedBox(width: 8),
                  const SizedBox(
                    width: 13,
                    height: 13,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(),
                  )
                : _error != null && _transactions.isEmpty
                    ? _errorState()
                    : _transactions.isEmpty
                        ? _emptyState()
                        : RefreshIndicator(
                            onRefresh: () => _load(
                              refreshing: true,
                            ),
                            child: ListView.builder(
                              controller: _scrollController,
                              physics: const AlwaysScrollableScrollPhysics(),
                              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                              itemCount:
                                  _transactions.length + (_loadingMore ? 1 : 0),
                              itemBuilder: (context, index) {
                                if (index == _transactions.length) {
                                  return const Padding(
                                    padding: EdgeInsets.all(18),
                                    child: Center(
                                      child: CircularProgressIndicator(),
                                    ),
                                  );
                                }

                                return PersonalTransactionItem(
                                  tx: Map<String, dynamic>.from(
                                    _transactions[index] as Map,
                                  ),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

class _ActiveFilterChip extends StatelessWidget {
  final String label;

  const _ActiveFilterChip({
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 7, bottom: 5),
      padding: const EdgeInsets.symmetric(
        horizontal: 10,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: AppTheme.primaryColor.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: AppTheme.primaryColor,
        ),
      ),
    );
  }
}
