// transaction_detail_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class TransactionDetailScreen extends StatefulWidget {
  final String transactionId;
  const TransactionDetailScreen({super.key, required this.transactionId});
  @override
  State<TransactionDetailScreen> createState() =>
      _TransactionDetailScreenState();
}

class _TransactionDetailScreenState extends State<TransactionDetailScreen> {
  Map<String, dynamic>? _tx;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res =
          await ApiClient.instance.get('/transactions/${widget.transactionId}');
      if (mounted) {
        setState(() {
          _tx = res.data['data'];
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
      appBar: AppBar(title: const Text('Transaction Details')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _tx == null
              ? const EmptyState(
                  icon: Icons.error_outline, title: 'Transaction not found')
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(children: [
                    // Status card
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(children: [
                          StatusBadge(status: _tx!['status'] ?? ''),
                          const SizedBox(height: 12),
                          GhsAmount(
                              amount: double.tryParse(
                                      _tx!['amount']?.toString() ?? '0') ??
                                  0,
                              fontSize: 32),
                          const SizedBox(height: 4),
                          Text(
                              (_tx!['transaction_type'] ?? '')
                                  .toString()
                                  .replaceAll('_', ' ')
                                  .toUpperCase(),
                              style: TextStyle(
                                  color: Colors.grey[600],
                                  letterSpacing: 1,
                                  fontSize: 12)),
                          const SizedBox(height: 8),
                          ProviderBadge(provider: _tx!['provider'] ?? ''),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Card(
                      child: Column(children: [
                        _DetailRow('Reference', _tx!['reference']),
                        if (_tx!['network_reference'] != null)
                          _DetailRow('Network Ref', _tx!['network_reference']),
                        _DetailRow('Customer', _tx!['customer_phone'] ?? '—'),
                        _DetailRow('Agent', _tx!['agent_name'] ?? '—'),
                        _DetailRow('Branch', _tx!['branch_name'] ?? '—'),
                        _DetailRow(
                            'Date',
                            _tx!['created_at'] != null
                                ? DateFormat('dd MMM yyyy, HH:mm')
                                    .format(DateTime.parse(_tx!['created_at']))
                                : '—'),
                        if (_tx!['net_commission'] != null)
                          _DetailRow('Commission',
                              'GH₵ ${double.tryParse(_tx!['net_commission'].toString())?.toStringAsFixed(2)}'),
                      ]),
                    ),
                    if (_tx!['failure_reason'] != null) ...[
                      const SizedBox(height: 12),
                      Card(
                        color: AppTheme.errorColor.withValues(alpha: 0.05),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(children: [
                            const Icon(Icons.error_outline,
                                color: AppTheme.errorColor),
                            const SizedBox(width: 12),
                            Expanded(
                                child: Text(_tx!['failure_reason'],
                                    style: const TextStyle(
                                        color: AppTheme.errorColor))),
                          ]),
                        ),
                      ),
                    ],
                  ]),
                ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String? value;
  const _DetailRow(this.label, this.value);
  @override
  Widget build(BuildContext context) {
    return ListTile(
      dense: true,
      title:
          Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
      trailing: GestureDetector(
        onLongPress: () {
          Clipboard.setData(ClipboardData(text: value ?? ''));
        },
        child: Text(value ?? '—',
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
      ),
    );
  }
}
