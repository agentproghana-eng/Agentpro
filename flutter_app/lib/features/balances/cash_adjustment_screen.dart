import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";

class CashAdjustmentScreen extends StatefulWidget {
  final String provider;
  const CashAdjustmentScreen({super.key, required this.provider});

  @override
  State<CashAdjustmentScreen> createState() => _CashAdjustmentScreenState();
}

enum _AdjMode { setValue, injection, withdrawal }

class _CashAdjustmentScreenState extends State<CashAdjustmentScreen> {
  _AdjMode _mode = _AdjMode.setValue;
  final _amountCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    final amount = double.tryParse(_amountCtrl.text);
    if (amount == null || amount < 0) {
      setState(() => _error = "Enter a valid amount");
      return;
    }
    setState(() { _loading = true; _error = null; });
    final type = _mode == _AdjMode.setValue
        ? "cash_set"
        : _mode == _AdjMode.injection
            ? "cash_injection"
            : "cash_withdrawal";
    try {
      final res = await ApiClient.instance.post("/balances/cash-adjustment", data: {
        "provider": widget.provider,
        "adjustment_type": type,
        "amount": amount,
        "reason": _reasonCtrl.text.trim(),
      });
      if (mounted) {
        final msg = res.data["message"] as String? ?? "Submitted";
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
        context.pop();
      }
    } catch (e) {
      setState(() { _error = "Failed to submit"; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isSetValue = _mode == _AdjMode.setValue;
    return Scaffold(
      appBar: AppBar(title: const Text("Adjust Cash at Hand")),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(children: [
          Row(children: [
            Expanded(child: _ModeTab(label: "Set Value", selected: isSetValue, onTap: () => setState(() { _mode = _AdjMode.setValue; _error = null; }))),
            const SizedBox(width: 6),
            Expanded(child: _ModeTab(label: "Injection / Withdrawal", selected: !isSetValue, onTap: () => setState(() { _mode = _AdjMode.injection; _error = null; }))),
          ]),
          const SizedBox(height: 16),
          if (isSetValue) ...[
            const Text("Current Cash at Hand Is", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
            const SizedBox(height: 8),
            TextField(controller: _amountCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(prefixText: "GH₵ ", border: OutlineInputBorder())),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: const Color(0xFFE6F4F1), borderRadius: BorderRadius.circular(10)),
              child: const Text("This takes effect immediately — a routine count, no approval needed.", style: TextStyle(fontSize: 11, color: AppTheme.primaryColor)),
            ),
          ] else ...[
            const Text("Type", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: _TypeChip(label: "Injection (+)", selected: _mode == _AdjMode.injection, onTap: () => setState(() => _mode = _AdjMode.injection))),
              const SizedBox(width: 8),
              Expanded(child: _TypeChip(label: "Withdrawal (−)", selected: _mode == _AdjMode.withdrawal, onTap: () => setState(() => _mode = _AdjMode.withdrawal))),
            ]),
            const SizedBox(height: 16),
            const Text("Amount", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
            const SizedBox(height: 8),
            TextField(controller: _amountCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(prefixText: "GH₵ ", border: OutlineInputBorder())),
            const SizedBox(height: 16),
            const Text("Reason", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
            const SizedBox(height: 8),
            TextField(controller: _reasonCtrl, decoration: const InputDecoration(hintText: "e.g. added my own cash for change", border: OutlineInputBorder())),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: const Color(0xFFFFF4D9), borderRadius: BorderRadius.circular(10)),
              child: const Text("This needs approval from your manager or business owner before it takes effect. Your balance won't change until then.", style: TextStyle(fontSize: 11, color: Color(0xFF7A5B00))),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: AppTheme.errorColor)),
          ],
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _loading ? null : _submit,
            child: _loading
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(isSetValue ? "Update Cash at Hand" : "Submit for Approval"),
          ),
        ]),
      ),
    );
  }
}

class _ModeTab extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _ModeTab({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(9),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: BoxDecoration(color: selected ? AppTheme.primaryColor : Colors.white, borderRadius: BorderRadius.circular(9)),
        child: Text(label, textAlign: TextAlign.center, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: selected ? Colors.white : Colors.grey)),
      ),
    );
  }
}

class _TypeChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _TypeChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(9),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: BoxDecoration(color: selected ? AppTheme.primaryColor : Colors.white, borderRadius: BorderRadius.circular(9)),
        child: Text(label, textAlign: TextAlign.center, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: selected ? Colors.white : Colors.grey)),
      ),
    );
  }
}
