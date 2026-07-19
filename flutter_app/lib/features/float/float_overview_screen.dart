import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

/// Manager-level float overview across every branch they manage, with
/// low-balance alerts. Previously lived as a bottom-nav tab on Manager's
/// dashboard; moved here as its own route so it survives the nav
/// restructure (Manager's bottom nav now matches Owner's).
class FloatOverviewScreen extends StatefulWidget {
  const FloatOverviewScreen({super.key});

  @override
  State<FloatOverviewScreen> createState() => _FloatOverviewScreenState();
}

class _FloatOverviewScreenState extends State<FloatOverviewScreen> {
  List<dynamic> _accounts = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get('/float/overview');
      if (mounted) {
        setState(() {
          _accounts = res.data['data']['accounts'] ?? [];
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Float Overview')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _accounts.isEmpty
                ? const EmptyState(icon: Icons.account_balance_wallet_outlined, title: 'No float accounts')
                : ListView.builder(
                    padding: const EdgeInsets.all(8),
                    itemCount: _accounts.length,
                    itemBuilder: (_, i) {
                      final acc = _accounts[i] as Map<String, dynamic>;
                      final balance = double.tryParse(acc['current_balance']?.toString() ?? '0') ?? 0;
                      final threshold = double.tryParse(acc['low_balance_threshold']?.toString() ?? '500') ?? 500;
                      final isLow = balance <= threshold;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 6),
                        child: ListTile(
                          leading: ProviderBadge(provider: acc['provider'] ?? ''),
                          title: Text(acc['branch_name'] ?? '',
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(isLow ? '⚠️ Low float alert' : 'Normal',
                            style: TextStyle(color: isLow ? AppTheme.errorColor : AppTheme.successColor, fontSize: 12)),
                          trailing: GhsAmount(
                            amount: balance, fontSize: 15,
                            color: isLow ? AppTheme.errorColor : null,
                          ),
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
