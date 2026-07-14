// subscription_screen.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});
  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  final _refCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.get('/subscriptions/status');
      if (mounted) setState(() { _data = res.data['data']; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _submitPayment() async {
    if (_refCtrl.text.isEmpty || _phoneCtrl.text.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await ApiClient.instance.post('/subscriptions/payment', data: {
        'momo_reference': _refCtrl.text.trim(),
        'payment_phone': _phoneCtrl.text.trim(),
      });
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Payment submitted! Pending verification.')));
        _load();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Submission failed'), backgroundColor: AppTheme.errorColor));
    } finally { if (mounted) setState(() => _submitting = false); }
  }

  @override
  Widget build(BuildContext context) {
    final sub = _data?['subscription'];
    final instructions = _data?['payment_instructions'];
    final status = sub?['status'] ?? 'unknown';
    final expiresAt = sub?['expires_at'];

    return Scaffold(
      appBar: AppBar(title: const Text('Subscription')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(16), children: [
              // Status Card
              Card(
                color: status == 'active' ? AppTheme.successColor.withOpacity(0.1) : AppTheme.errorColor.withOpacity(0.1),
                child: Padding(padding: const EdgeInsets.all(20), child: Column(children: [
                  Icon(status == 'active' ? Icons.check_circle : Icons.warning,
                    color: status == 'active' ? AppTheme.successColor : AppTheme.errorColor, size: 48),
                  const SizedBox(height: 8),
                  Text(status == 'active' ? 'Business Plan — Active' : 'Subscription ${status.toUpperCase()}',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  if (expiresAt != null) ...[
                    const SizedBox(height: 4),
                    Text('Expires: ${DateFormat('dd MMM yyyy').format(DateTime.parse(expiresAt))}',
                      style: TextStyle(color: Colors.grey[700])),
                  ],
                ])),
              ),
              const SizedBox(height: 16),

              // Plan Features
              Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("Business Plan — GH₵${((_data?["payment_instructions"]?["amount"] as num?) ?? 10).toStringAsFixed(2)}/month", style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 12),
                  for (final f in [
                    'All Mobile Money transactions (MTN, Telecel, AT)',
                    'Multi-branch management',
                    'Float management & alerts',
                    'Commission tracking',
                    'Reports (PDF, Excel, CSV)',
                    'Business Hub (Marketplace)',
                    'AI Assistant',
                    'Push notifications',
                    'Cloud sync',
                  ])
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(children: [
                        const Icon(Icons.check, color: AppTheme.successColor, size: 16),
                        const SizedBox(width: 8),
                        Expanded(child: Text(f, style: const TextStyle(fontSize: 13))),
                      ]),
                    ),
                ],
              ))),
              const SizedBox(height: 16),

              // Payment Instructions
              if (instructions != null)
                Card(
                  color: Colors.amber[50],
                  child: Padding(padding: const EdgeInsets.all(16), child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('How to Pay', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      Text('1. Send GH₵${instructions['amount']} via MTN MoMo'),
                      Text('2. To: ${instructions['merchant_number']} (${instructions['merchant_name']})'),
                      const Text('3. Copy the transaction reference'),
                      const Text('4. Submit the reference below'),
                    ],
                  )),
                ),
              const SizedBox(height: 16),

              AppButton(
                label: status == 'active' ? 'Submit Renewal Payment' : 'Submit Payment to Activate',
                icon: Icons.payment,
                onPressed: () => showModalBottomSheet(
                  context: context, isScrollControlled: true,
                  shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
                  builder: (_) => Padding(
                    padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
                    child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      const Text('Submit Payment Reference', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 16),
                      TextField(controller: _refCtrl, decoration: const InputDecoration(labelText: 'MTN MoMo Reference', border: OutlineInputBorder(), prefixIcon: Icon(Icons.receipt))),
                      const SizedBox(height: 12),
                      TextField(controller: _phoneCtrl, keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(labelText: 'Phone used to pay', border: OutlineInputBorder(), prefixIcon: Icon(Icons.phone))),
                      const SizedBox(height: 20),
                      AppButton(label: 'Submit Reference', onPressed: _submitPayment, isLoading: _submitting),
                    ]),
                  ),
                ),
              ),
            ]),
    );
  }
}
