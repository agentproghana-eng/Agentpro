import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";

class FloatReceivedScreen extends StatefulWidget {
  final String initialProvider;
  const FloatReceivedScreen({super.key, required this.initialProvider});

  @override
  State<FloatReceivedScreen> createState() => _FloatReceivedScreenState();
}

class _FloatReceivedScreenState extends State<FloatReceivedScreen> {
  late String _provider;
  final _amountCtrl = TextEditingController();
  final _refCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _provider = widget.initialProvider;
  }

  Future<void> _submit() async {
    final amount = double.tryParse(_amountCtrl.text);
    if (amount == null || amount <= 0) {
      setState(() => _error = "Enter a valid amount");
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient.instance.post("/balances/float-received", data: {
        "provider": _provider,
        "amount": amount,
        "reference": _refCtrl.text.trim(),
      });
      if (mounted) context.pop();
    } catch (e) {
      setState(() { _error = "Failed to record float received"; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Declare Float Received")),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(children: [
          const Text("Provider", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
          const SizedBox(height: 8),
          Row(children: [
            _ProviderPill(label: "MTN", value: "mtn", selected: _provider == "mtn", onTap: (v) => setState(() => _provider = v)),
            const SizedBox(width: 6),
            _ProviderPill(label: "Telecel", value: "telecel", selected: _provider == "telecel", onTap: (v) => setState(() => _provider = v)),
            const SizedBox(width: 6),
            _ProviderPill(label: "AirtelTigo", value: "at_money", selected: _provider == "at_money", onTap: (v) => setState(() => _provider = v)),
          ]),
          const SizedBox(height: 16),
          const Text("Amount Received", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
          const SizedBox(height: 8),
          TextField(
            controller: _amountCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(prefixText: "GH₵ ", border: OutlineInputBorder()),
          ),
          const SizedBox(height: 16),
          const Text("Reference (optional)", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
          const SizedBox(height: 8),
          TextField(
            controller: _refCtrl,
            decoration: const InputDecoration(hintText: "e.g. super-agent name or receipt no.", border: OutlineInputBorder()),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: const Color(0xFFE6F4F1), borderRadius: BorderRadius.circular(10)),
            child: const Text(
              "This adds directly to your e-Float balance. No approval needed — you're the only one who knows this happened.",
              style: TextStyle(fontSize: 11, color: AppTheme.primaryColor),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: AppTheme.errorColor)),
          ],
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _loading ? null : _submit,
            child: _loading
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text("Confirm Received"),
          ),
        ]),
      ),
    );
  }
}

class _ProviderPill extends StatelessWidget {
  final String label;
  final String value;
  final bool selected;
  final void Function(String) onTap;

  const _ProviderPill({required this.label, required this.value, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: () => onTap(value),
        borderRadius: BorderRadius.circular(9),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: selected ? AppTheme.primaryColor : Colors.white,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Text(label, textAlign: TextAlign.center, style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: selected ? Colors.white : Colors.grey)),
        ),
      ),
    );
  }
}
