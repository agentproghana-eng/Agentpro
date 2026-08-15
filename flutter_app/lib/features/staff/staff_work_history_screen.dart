import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../shared/widgets/app_widgets.dart';
import '../transactions/transaction_detail_screen.dart';

class StaffWorkHistoryScreen extends StatefulWidget {
  final String userId;
  final String userName;
  const StaffWorkHistoryScreen(
      {super.key, required this.userId, required this.userName});

  @override
  State<StaffWorkHistoryScreen> createState() => _StaffWorkHistoryScreenState();
}

class _StaffWorkHistoryScreenState extends State<StaffWorkHistoryScreen> {
  List<dynamic> _transactions = [];
  bool _loading = true;
  bool _loadingMore = false;
  int _page = 1;
  int _totalPages = 1;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool loadMore = false}) async {
    if (loadMore) {
      if (_loading || _loadingMore || _page >= _totalPages) return;
      setState(() => _loadingMore = true);
    } else {
      setState(() {
        _loading = true;
        _loadingMore = false;
        _error = null;
      });
    }

    final nextPage = loadMore ? _page + 1 : 1;

    try {
      final res = await ApiClient.instance.get(
        '/transactions',
        queryParameters: {
          'agent_id': widget.userId,
          'page': nextPage,
          'limit': 30,
        },
      );

      if (!mounted) return;

      final data = List<dynamic>.from(res.data['data'] ?? const []);
      final meta = res.data['meta'] as Map<String, dynamic>?;

      setState(() {
        _transactions = loadMore ? [..._transactions, ...data] : data;
        _page = (meta?['page'] as num?)?.toInt() ?? nextPage;
        _totalPages = (meta?['total_pages'] as num?)?.toInt() ?? 1;
        _loading = false;
        _loadingMore = false;
      });
    } catch (_) {
      if (!mounted) return;

      if (loadMore) {
        setState(() => _loadingMore = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not load more transaction history'),
          ),
        );
      } else {
        setState(() {
          _error = 'Could not load transaction history';
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('${widget.userName} - Work History')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _transactions.isEmpty
                  ? const EmptyState(
                      icon: Icons.receipt_long_outlined,
                      title: 'No transactions yet',
                      subtitle:
                          'This person has not processed any transactions',
                    )
                  : RefreshIndicator(
                      onRefresh: () => _load(),
                      child: ListView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(8),
                        itemCount: _transactions.length +
                            (_page < _totalPages ? 1 : 0),
                        itemBuilder: (_, i) {
                          if (i >= _transactions.length) {
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Center(
                                child: OutlinedButton(
                                  onPressed: _loadingMore
                                      ? null
                                      : () => _load(loadMore: true),
                                  child: _loadingMore
                                      ? const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : const Text('Load more history'),
                                ),
                              ),
                            );
                          }

                          final tx = _transactions[i] as Map<String, dynamic>;
                          return Card(
                            margin: const EdgeInsets.only(bottom: 6),
                            child: ListTile(
                              onTap: () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => TransactionDetailScreen(
                                      transactionId: tx['id']),
                                ),
                              ),
                              title: Text(
                                  "${(tx["transaction_type"] ?? "").toString().toUpperCase()} - GH₵${tx["amount"] ?? "0.00"}"),
                              subtitle: Text(
                                  "${tx["provider"] ?? ""} - ${tx["branch_name"] ?? ""} - ${(tx["created_at"] ?? "").toString().split("T").first}"),
                              trailing: StatusBadge(status: tx['status'] ?? ''),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
