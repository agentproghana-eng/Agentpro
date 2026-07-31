// personal_transaction_history_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';
import '../../shared/widgets/personal_transaction_item.dart';

/// Paid-only per spec (Free users get the same last-5 preview on
/// Personal Home, but not this full paginated view). Re-checks isPaid
/// itself, defense-in-depth, in case this is ever reached via a direct
/// link rather than only through Personal Home's gated "See All".
class PersonalTransactionHistoryScreen extends StatefulWidget {
  const PersonalTransactionHistoryScreen({super.key});
  @override
  State<PersonalTransactionHistoryScreen> createState() => _PersonalTransactionHistoryScreenState();
}

class _PersonalTransactionHistoryScreenState extends State<PersonalTransactionHistoryScreen> {
  List<dynamic> _transactions = [];
  int _page = 1;
  int _totalPages = 1;
  bool _loading = true;
  bool _loadingMore = false;

  bool get _isPaid {
    final state = context.read<AuthBloc>().state;
    return state is AuthAuthenticated && state.user['personal_subscription_plan'] == 'paid';
  }

  @override
  void initState() {
    super.initState();
    if (_isPaid) _load();
  }

  Future<void> _load({bool loadMore = false}) async {
    setState(() => loadMore ? _loadingMore = true : _loading = true);
    try {
      final nextPage = loadMore ? _page + 1 : 1;
      final res = await ApiClient.instance.get('/personal-transactions', queryParameters: {'page': nextPage, 'limit': 20});
      final data = (res.data['data'] as List?) ?? [];
      final meta = res.data['meta'] as Map<String, dynamic>?;
      if (mounted) {
        setState(() {
          _transactions = loadMore ? [..._transactions, ...data] : data;
          _page = nextPage;
          _totalPages = meta?['total_pages'] ?? 1;
          _loading = false;
          _loadingMore = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() { _loading = false; _loadingMore = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_isPaid) {
      return Scaffold(
        appBar: AppBar(title: const Text('Transaction History')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Icon(Icons.lock_outline, size: 48, color: AppTheme.primaryColor),
              const SizedBox(height: 16),
              const Text('Full history is a Paid feature', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('Upgrade your Personal plan to see your complete transaction history.',
                textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
              const SizedBox(height: 20),
              AppButton(label: 'Upgrade to Paid', onPressed: () => context.push('/personal-subscription')),
            ]),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Transaction History')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _transactions.isEmpty
              ? const Center(child: Text('No transactions yet'))
              : RefreshIndicator(
                  onRefresh: () => _load(),
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _transactions.length + (_page < _totalPages ? 1 : 0),
                    itemBuilder: (context, i) {
                      if (i == _transactions.length) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Center(
                            child: _loadingMore
                                ? const CircularProgressIndicator()
                                : TextButton(onPressed: () => _load(loadMore: true), child: const Text('Load More')),
                          ),
                        );
                      }
                      return PersonalTransactionItem(tx: _transactions[i] as Map<String, dynamic>);
                    },
                  ),
                ),
    );
  }
}
