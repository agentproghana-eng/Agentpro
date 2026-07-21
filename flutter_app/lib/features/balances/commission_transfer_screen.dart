import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";

class CommissionTransferScreen extends StatefulWidget {
  final String provider;
  const CommissionTransferScreen({super.key, required this.provider});

  @override
  State<CommissionTransferScreen> createState() => _CommissionTransferScreenState();
}

class _CommissionTransferScreenState extends State<CommissionTransferScreen> {
  final _amountCtrl = TextEditingController();
  double _available = 0;
  bool _loadingBalance = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadBalance();
  }

  Future<void> _loadBalance() async {
    try {
      final res = await ApiClient.instance.get("/balances");
      final list = res.data["data"] as List;
      final match = list.firstWhere((b) => b["provider"] == widget.provider, orElse: () => null);
      setState(() {
        _available = match != null ? (double.tryParse(match["commission_balance"].toString()) ?? 0) : 0;
        _loadingBalance = false;
      });
    } catch (e) {
      setState(() => _loadingBalance = false);
    }
  }

  // Actually dials the real MTN "My Wallet > Commissions > Transfer
  // Commission to Wallet" USSD flow via the same accessibility
  // automation pipeline every other transaction type uses - this used
  // to just call /balances/commission-transfer directly, which only
  // recorded a backend adjustment without ever touching the real
  // network, despite the on-screen text claiming otherwise.
  Future<void> _submit() async {
    final amount = double.tryParse(_amountCtrl.text);
    if (amount == null || amount <= 0) {
      setState(() => _error = "Enter a valid amount");
      return;
    }
    if (amount > _available) {
      setState(() => _error = "Amount exceeds available commission");
      return;
    }
    setState(() { _submitting = true; _error = null; });
    try {
      final res = await ApiClient.instance.post('/transactions', data: {
        'provider': widget.provider,
        'transaction_type': 'commission_transfer',
        'amount': amount,
        'customer_phone': '',
        'customer_name': '',
        'recipient_phone': '',
        'biller_code': '',
        'account_number': '',
        'payment_reference': '',
        'fee': 0,
        'notes': '',
      });

      if (!mounted) return;
      context.push('/transactions/progress', extra: {
        'transaction': res.data['data'],
        'provider': widget.provider,
        'transaction_type': 'commission_transfer',
        'amount': _amountCtrl.text,
        'customer_phone': '',
        'customer_name': '',
      });
    } catch (e) {
      setState(() { _error = "Failed to start commission transfer"; _submitting = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Transfer Commission to e-Float")),
      body: _loadingBalance
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16),
              child: ListView(children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 4)]),
                  child: Column(children: [
                    const Text("Available to Transfer", style: TextStyle(fontSize: 11, color: Colors.grey, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text("GH₵ ${_available.toStringAsFixed(2)}", style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF5B4B8A))),
                  ]),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _amountCtrl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: "Amount to Transfer", prefixText: "GH₵ ", border: OutlineInputBorder()),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: const Color(0xFFE6F4F1), borderRadius: BorderRadius.circular(10)),
                  child: const Text(
                    "This dials your network's own USSD commission-transfer code directly. You will enter your MoMo PIN only on the official network screen.",
                    style: TextStyle(fontSize: 11, color: AppTheme.primaryColor),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: AppTheme.errorColor)),
                ],
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text("Dial to Transfer"),
                ),
              ]),
            ),
    );
  }
}
