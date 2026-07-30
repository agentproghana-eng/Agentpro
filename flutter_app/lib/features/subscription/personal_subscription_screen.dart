// personal_subscription_screen.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class PersonalSubscriptionScreen extends StatefulWidget {
  const PersonalSubscriptionScreen({super.key});
  @override
  State<PersonalSubscriptionScreen> createState() => _PersonalSubscriptionScreenState();
}

class _PersonalSubscriptionScreenState extends State<PersonalSubscriptionScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  final _refCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _refCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.get('/personal-subscription/status');
      if (mounted) setState(() { _data = res.data['data']; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submitPayment() async {
    if (_refCtrl.text.isEmpty || _phoneCtrl.text.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await ApiClient.instance.post('/personal-subscription/payment', data: {
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
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Submission failed'), backgroundColor: AppTheme.errorColor));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sub = _data?['subscription'];
    final instructions = _data?['payment_instructions'];
    final plan = sub?['plan'] ?? 'free';
    final expiresAt = sub?['expires_at'];
    final isPaid = plan == 'paid';

    return Scaffold(
      appBar: AppBar(title: const Text('My Subscription')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(16), children: [
              Card(
                color: isPaid ? AppTheme.successColor.withOpacity(0.1) : Colors.grey.withOpacity(0.1),
                child: Padding(padding: const EdgeInsets.all(20), child: Column(children: [
                  Icon(isPaid ? Icons.check_circle : Icons.info_outline,
                    color: isPaid ? AppTheme.successColor : Colors.grey[700], size: 48),
                  const SizedBox(height: 8),
                  Text(isPaid ? 'Personal Plan — Paid' : 'Personal Plan — Free',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  if (isPaid && expiresAt != null) ...[
                    const SizedBox(height: 4),
                    Text('Renews/Expires: ${DateFormat('dd MMM yyyy').format(DateTime.parse(expiresAt))}',
                      style: TextStyle(color: Colors.grey[700])),
                  ],
                ])),
              ),
              const SizedBox(height: 16),

              Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Free — Included', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 12),
                  for (final f in [
                    'Send Money, Buy Airtime/Data/Mash Up',
                    'Check MoMo & Airtime Balance',
                    'View & react to Personal Community posts',
                    'Browse & post in the Business Hub',
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

              Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Paid Plan — GH₵5.00/month', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 12),
                  for (final f in [
                    'Post, comment & reply in the Personal Community',
                    'USSD Automation (auto-dial transactions)',
                    'Custom USSD Flows',
                    'Transaction Reports (PDF & CSV)',
                    'No ads',
                  ])
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(children: [
                        Icon(Icons.check, color: isPaid ? AppTheme.successColor : Colors.grey, size: 16),
                        const SizedBox(width: 8),
                        Expanded(child: Text(f, style: const TextStyle(fontSize: 13))),
                      ]),
                    ),
                ],
              ))),
              const SizedBox(height: 16),

              if (instructions != null && !isPaid)
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

              if (!isPaid)
                AppButton(
                  label: 'Upgrade to Paid',
                  icon: Icons.upgrade,
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
