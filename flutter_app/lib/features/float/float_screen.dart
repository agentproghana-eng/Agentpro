import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class FloatScreen extends StatefulWidget {
  final String? branchId;
  const FloatScreen({super.key, this.branchId});
  @override
  State<FloatScreen> createState() => _FloatScreenState();
}

class _FloatScreenState extends State<FloatScreen> {
  List<dynamic> _accounts = [];
  double _total = 0;
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.get('/float/overview', queryParameters: widget.branchId != null ? {'branch_id': widget.branchId} : null);
      if (mounted) setState(() {
        _accounts = res.data['data']['accounts'] ?? [];
        _total = double.tryParse(res.data['data']['grand_total']?.toString() ?? '0') ?? 0;
        _loading = false;
      });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Float Management')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () async => _load(),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Total card
                  Card(
                    color: AppTheme.primaryColor,
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('Total Float Balance', style: TextStyle(color: Colors.white70, fontSize: 13)),
                        const SizedBox(height: 8),
                        Text('GH₵ ${_total.toStringAsFixed(2)}',
                          style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        Text(widget.branchId != null ? 'All providers · This branch' : 'All providers · All branches', style: const TextStyle(color: Colors.white60, fontSize: 12)),
                      ]),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const SectionHeader(title: 'FLOAT BY BRANCH & PROVIDER'),
                  const SizedBox(height: 8),
                  if (_accounts.isEmpty)
                    const EmptyState(icon: Icons.account_balance_wallet_outlined, title: 'No float accounts yet')
                  else
                    ..._accounts.map((acc) => _FloatCard(account: acc)),
                ],
              ),
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showTopUpSheet(context),
        icon: const Icon(Icons.add),
        label: const Text('Top Up Float'),
        backgroundColor: AppTheme.primaryColor,
      ),
    );
  }

  void _showTopUpSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _TopUpSheet(onDone: _load),
    );
  }
}

class _FloatCard extends StatelessWidget {
  final Map<String, dynamic> account;
  const _FloatCard({required this.account});

  @override
  Widget build(BuildContext context) {
    final balance = double.tryParse(account['current_balance']?.toString() ?? '0') ?? 0;
    final threshold = double.tryParse(account['low_balance_threshold']?.toString() ?? '0') ?? 0;
    final isLow = balance <= threshold;
    final provider = account['provider'] ?? '';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: CircleAvatar(
          backgroundColor: AppTheme.providerColor(provider).withOpacity(0.15),
          child: ProviderBadge(provider: provider),
        ),
        title: Text(account['branch_name'] ?? 'Branch',
          style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(isLow ? '⚠️ Low float' : 'Threshold: GH₵ ${threshold.toStringAsFixed(2)}',
          style: TextStyle(color: isLow ? AppTheme.errorColor : Colors.grey[600], fontSize: 12)),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            GhsAmount(amount: balance, fontSize: 16, color: isLow ? AppTheme.errorColor : null),
            Text('Updated: ${account['last_updated_at'] != null
                ? DateTime.parse(account['last_updated_at']).toLocal().toString().substring(5, 16)
                : '—'}',
              style: TextStyle(color: Colors.grey[400], fontSize: 10)),
          ],
        ),
      ),
    );
  }
}

class _TopUpSheet extends StatefulWidget {
  final VoidCallback onDone;
  const _TopUpSheet({required this.onDone});
  @override
  State<_TopUpSheet> createState() => _TopUpSheetState();
}

class _TopUpSheetState extends State<_TopUpSheet> {
  final _amountCtrl = TextEditingController();
  final _refCtrl = TextEditingController();
  String _provider = 'mtn';
  String? _branchId;
  List<dynamic> _branches = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    ApiClient.instance.get('/branches').then((res) {
      if (mounted) setState(() {
        _branches = res.data['data'] ?? [];
        if (_branches.isNotEmpty) _branchId = _branches.first['id'];
      });
    });
  }

  Future<void> _submit() async {
    if (_amountCtrl.text.isEmpty || _branchId == null) return;
    setState(() => _loading = true);
    try {
      await ApiClient.instance.post('/float/top-up', data: {
        'branch_id': _branchId,
        'provider': _provider,
        'amount': double.parse(_amountCtrl.text),
        'reference': _refCtrl.text.trim(),
      });
      if (mounted) {
        Navigator.pop(context);
        widget.onDone();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Float topped up successfully ✅')));
      }
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Top-up failed'), backgroundColor: AppTheme.errorColor));
    } finally { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Top Up Float', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        if (_branches.isNotEmpty)
          DropdownButtonFormField<String>(
            value: _branchId,
            decoration: const InputDecoration(labelText: 'Branch', border: OutlineInputBorder()),
            items: _branches.map((b) => DropdownMenuItem(value: b['id'] as String, child: Text(b['name'] as String))).toList(),
            onChanged: (v) => setState(() => _branchId = v),
          ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: _provider,
          decoration: const InputDecoration(labelText: 'Provider', border: OutlineInputBorder()),
          items: const [
            DropdownMenuItem(value: 'mtn', child: Text('MTN Mobile Money')),
            DropdownMenuItem(value: 'telecel', child: Text('Telecel Cash')),
            DropdownMenuItem(value: 'at_money', child: Text('AT Money')),
          ],
          onChanged: (v) => setState(() => _provider = v!),
        ),
        const SizedBox(height: 12),
        TextField(controller: _amountCtrl, keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Amount (GH₵)', prefixText: 'GH₵  ', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        TextField(controller: _refCtrl, decoration: const InputDecoration(labelText: 'Reference (optional)', border: OutlineInputBorder())),
        const SizedBox(height: 20),
        AppButton(label: 'Top Up', onPressed: _submit, isLoading: _loading),
      ]),
    );
  }
}
