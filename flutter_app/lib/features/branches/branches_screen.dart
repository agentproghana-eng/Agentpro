import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

/// Standalone branches list screen.
/// Used by managers (read-only context — they don't create branches)
/// and reachable as a deep link from anywhere in the app.
class BranchesScreen extends StatefulWidget {
  const BranchesScreen({super.key});

  @override
  State<BranchesScreen> createState() => _BranchesScreenState();
}

class _BranchesScreenState extends State<BranchesScreen> {
  List<dynamic> _branches = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await ApiClient.instance.get('/branches');
      if (mounted) {
        setState(() {
          _branches = res.data['data'] ?? [];
          _loading = false;
        });
      }
    } on DioException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.response?.data?['message'] ?? 'Failed to load branches';
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Branches')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? EmptyState(
                  icon: Icons.error_outline,
                  title: 'Could not load branches',
                  subtitle: _error,
                  actionLabel: 'Retry',
                  onAction: _load,
                )
              : _branches.isEmpty
                  ? const EmptyState(
                      icon: Icons.store_outlined,
                      title: 'No branches yet',
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(8),
                        itemCount: _branches.length,
                        itemBuilder: (_, i) {
                          final b = _branches[i] as Map<String, dynamic>;
                          final float = double.tryParse(b['total_float']?.toString() ?? '0') ?? 0;
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ExpansionTile(
                              leading: CircleAvatar(
                                backgroundColor: AppTheme.primaryColor.withOpacity(0.1),
                                child: const Icon(Icons.store, color: AppTheme.primaryColor),
                              ),
                              title: Text(b['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold)),
                              subtitle: Text(b['location'] ?? '', style: const TextStyle(fontSize: 12)),
                              trailing: GhsAmount(amount: float, fontSize: 13),
                              children: [
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.stretch,
                                    children: [
                                      _Row('Agents', '${b['agent_count'] ?? 0}'),
                                      _Row('Managers', '${b['manager_count'] ?? 0}'),
                                      _Row('Status', (b['status'] ?? '').toString().toUpperCase()),
                                      const SizedBox(height: 8),
                                      Row(children: [
                                        Expanded(
                                          child: OutlinedButton.icon(
                                            onPressed: () => context.push('/float?branch_id=${b['id']}'),
                                            icon: const Icon(Icons.account_balance_wallet, size: 16),
                                            label: const Text('Float'),
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: OutlinedButton.icon(
                                            onPressed: () => context.push('/transactions'),
                                            icon: const Icon(Icons.receipt_long, size: 16),
                                            label: const Text('Transactions'),
                                          ),
                                        ),
                                      ]),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label, value;
  const _Row(this.label, this.value);
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
        const Spacer(),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
      ]),
    );
  }
}
