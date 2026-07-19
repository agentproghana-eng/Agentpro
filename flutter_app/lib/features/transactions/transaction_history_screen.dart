import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

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
  const TransactionHistoryScreen({super.key});

  @override
  State<TransactionHistoryScreen> createState() => _TransactionHistoryScreenState();
}

class _TransactionHistoryScreenState extends State<TransactionHistoryScreen> {
  List<dynamic> _transactions = [];
  List<dynamic> _branches = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  int _page = 1;
  String? _error;
  bool _showBranchFilter = false;

  String _typeFilter = 'all';
  String _providerFilter = 'all';
  String? _branchFilter;
  String _sortBy = 'date';
  String _sortOrder = 'desc';

  final _scrollController = ScrollController();

  final _types = const [
    {'value': 'all', 'label': 'All'},
    {'value': 'cash_in', 'label': 'Cash In'},
    {'value': 'cash_out', 'label': 'Cash Out'},
    {'value': 'send_money', 'label': 'Send'},
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
    {'value': 'fee', 'label': 'Transfer Charge'},
  ];

  @override
  void initState() {
    super.initState();
    _checkRoleForBranchFilter();
    _load();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
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

  Map<String, dynamic> _buildQueryParams({required int page}) {
    return {
      'page': page,
      'limit': 20,
      'sort_by': _sortBy,
      'sort_order': _sortOrder,
      if (_typeFilter != 'all') 'transaction_type': _typeFilter,
      if (_providerFilter != 'all') 'provider': _providerFilter,
      if (_branchFilter != null) 'branch_id': _branchFilter,
    };
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; _page = 1; _hasMore = true; });
    try {
      final res = await ApiClient.instance.get('/transactions', queryParameters: _buildQueryParams(page: 1));
      final data = (res.data['data'] as List?) ?? [];
      final meta = res.data['meta'] as Map<String, dynamic>?;
      if (mounted) setState(() {
        _transactions = data;
        _loading = false;
        _hasMore = meta != null && (meta['page'] as int) < (meta['total_pages'] as int);
      });
    } catch (_) {
      if (mounted) setState(() { _error = 'Failed to load transactions'; _loading = false; });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    final nextPage = _page + 1;
    try {
      final res = await ApiClient.instance.get('/transactions', queryParameters: _buildQueryParams(page: nextPage));
      final data = (res.data['data'] as List?) ?? [];
      final meta = res.data['meta'] as Map<String, dynamic>?;
      if (mounted) setState(() {
        _transactions.addAll(data);
        _page = nextPage;
        _loadingMore = false;
        _hasMore = meta != null && (meta['page'] as int) < (meta['total_pages'] as int);
      });
    } catch (_) {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _showSortSheet() async {
    String tempSortBy = _sortBy;
    String tempSortOrder = _sortOrder;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: const EdgeInsets.all(16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Sort By', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            for (final option in _sortOptions)
              RadioListTile<String>(
                value: option['value']!,
                groupValue: tempSortBy,
                title: Text(option['label']!),
                onChanged: (v) => setSheetState(() => tempSortBy = v!),
                activeColor: AppTheme.primaryColor,
                dense: true,
              ),
            const SizedBox(height: 8),
            const Text('Direction', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: ChoiceChip(
                  label: const Text('Ascending'),
                  selected: tempSortOrder == 'asc',
                  onSelected: (_) => setSheetState(() => tempSortOrder = 'asc'),
                  selectedColor: AppTheme.primaryColor.withOpacity(0.15),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ChoiceChip(
                  label: const Text('Descending'),
                  selected: tempSortOrder == 'desc',
                  onSelected: (_) => setSheetState(() => tempSortOrder = 'desc'),
                  selectedColor: AppTheme.primaryColor.withOpacity(0.15),
                ),
              ),
            ]),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () {
                setState(() { _sortBy = tempSortBy; _sortOrder = tempSortOrder; });
                Navigator.pop(ctx);
                _load();
              },
              child: const Text('Apply'),
            ),
          ]),
        ),
      ),
    );
  }

  String _sortLabel() {
    final labels = {'date': 'Date', 'amount': 'Amount', 'commission': 'Commission', 'fee': 'Charge'};
    final arrow = _sortOrder == 'asc' ? '↑' : '↓';
    return '${labels[_sortBy] ?? 'Date'} $arrow';
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  Widget _filterPillRow(List<Map<String, String>> options, String current, void Function(String) onSelect) {
    return Row(children: options.map((opt) {
      final selected = current == opt['value'];
      return Expanded(
        child: GestureDetector(
          onTap: () => onSelect(opt['value']!),
          child: Container(
            margin: const EdgeInsets.only(right: 6),
            padding: const EdgeInsets.symmetric(vertical: 7),
            decoration: BoxDecoration(
              color: selected ? AppTheme.primaryColor : Colors.white,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(opt['label']!, textAlign: TextAlign.center,
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold,
                color: selected ? Colors.white : Colors.grey)),
          ),
        ),
      );
    }).toList());
  }

  Widget _filterSectionLabel(String text) => Padding(
    padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
    child: Text(text, style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.grey[500], letterSpacing: 0.5)),
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Transaction History'),
        actions: [
          TextButton.icon(
            onPressed: _showSortSheet,
            icon: const Icon(Icons.swap_vert, color: Colors.white, size: 18),
            label: Text(_sortLabel(), style: const TextStyle(color: Colors.white, fontSize: 12)),
          ),
        ],
      ),
      body: Column(children: [
        _filterSectionLabel('TYPE'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: _filterPillRow(_types, _typeFilter, (v) { setState(() => _typeFilter = v); _load(); }),
        ),

        _filterSectionLabel('PROVIDER'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: _filterPillRow(_providers, _providerFilter, (v) { setState(() => _providerFilter = v); _load(); }),
        ),

        if (_showBranchFilter && _branches.isNotEmpty) ...[
          _filterSectionLabel('BRANCH'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String?>(
                  value: _branchFilter,
                  isExpanded: true,
                  hint: const Text('All Branches', style: TextStyle(fontSize: 12)),
                  items: [
                    const DropdownMenuItem<String?>(value: null, child: Text('All Branches', style: TextStyle(fontSize: 12))),
                    for (final b in _branches)
                      DropdownMenuItem<String?>(value: b['id'] as String, child: Text(b['name'] ?? '', style: const TextStyle(fontSize: 12))),
                  ],
                  onChanged: (v) { setState(() => _branchFilter = v); _load(); },
                ),
              ),
            ),
          ),
        ],

        const SizedBox(height: 8),
        const Divider(height: 1),

        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(child: Text(_error!))
                  : _transactions.isEmpty
                      ? const Center(child: Text('No transactions found'))
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.builder(
                            controller: _scrollController,
                            padding: const EdgeInsets.all(12),
                            itemCount: _transactions.length + (_hasMore ? 1 : 0),
                            itemBuilder: (_, i) {
                              if (i >= _transactions.length) {
                                return const Padding(
                                  padding: EdgeInsets.all(16),
                                  child: Center(child: CircularProgressIndicator()),
                                );
                              }
                              final tx = _transactions[i] as Map<String, dynamic>;
                              return _TransactionRow(tx: tx);
                            },
                          ),
                        ),
        ),
      ]),
    );
  }
}

class _TransactionRow extends StatelessWidget {
  final Map<String, dynamic> tx;
  const _TransactionRow({required this.tx});

  @override
  Widget build(BuildContext context) {
    final type = (tx['transaction_type'] ?? '').toString();
    final isCashIn = type == 'cash_in';
    final amount = double.tryParse(tx['amount']?.toString() ?? '0') ?? 0;
    final commission = tx['net_commission'] != null ? double.tryParse(tx['net_commission'].toString()) : null;
    final fee = tx['fee'] != null ? double.tryParse(tx['fee'].toString()) : null;
    DateTime? created;
    try { created = DateTime.parse(tx['created_at'].toString()); } catch (_) {}
    final dateStr = created != null ? DateFormat('dd MMM, HH:mm').format(created.toLocal()) : '';

    final subParts = <String>[];
    if (tx['customer_phone'] != null) subParts.add(tx['customer_phone'].toString());
    subParts.add(dateStr);
    if (commission != null && commission > 0) subParts.add('Comm. GH₵${commission.toStringAsFixed(2)}');
    if (fee != null && fee > 0) subParts.add('Charge GH₵${fee.toStringAsFixed(2)}');

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: AppTheme.providerColor(tx['provider'] ?? '').withOpacity(0.15),
          child: Icon(isCashIn ? Icons.call_received : Icons.call_made, color: AppTheme.providerColor(tx['provider'] ?? '')),
        ),
        title: Row(mainAxisSize: MainAxisSize.min, children: [
          Text(type.replaceAll('_', ' '), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(width: 6),
          ProviderBadge(provider: tx['provider'] ?? ''),
        ]),
        subtitle: Text(subParts.join(' · '), style: const TextStyle(fontSize: 11)),
        trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
          GhsAmount(amount: amount, fontSize: 13),
          const SizedBox(height: 2),
          StatusBadge(status: tx['status'] ?? ''),
        ]),
        onTap: () => context.push('/transactions/${tx['id']}'),
      ),
    );
  }
}
