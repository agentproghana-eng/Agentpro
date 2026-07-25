import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";

class CloseShiftScreen extends StatefulWidget {
  final String shiftId;
  const CloseShiftScreen({super.key, required this.shiftId});

  @override
  State<CloseShiftScreen> createState() => _CloseShiftScreenState();
}

class _CloseShiftScreenState extends State<CloseShiftScreen> {
  final _cashCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  bool _loading = false;
  String? _error;
  Map<String, dynamic>? _result;

  Future<void> _submit() async {
    final actual = double.tryParse(_cashCtrl.text);
    if (actual == null || actual < 0) {
      setState(() => _error = "Enter the actual cash you counted");
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final res = await ApiClient.instance.post("/shifts/${widget.shiftId}/close", data: {
        "closing_cash_actual": actual,
        "notes": _notesCtrl.text.trim(),
      });
      if (mounted) setState(() { _result = res.data["data"]; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = "Failed to close shift"; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_result != null) return _buildResult(context);

    return Scaffold(
      appBar: AppBar(title: const Text("Close Shift")),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(children: [
          const Text("Count your physical cash and enter the total", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
          const SizedBox(height: 8),
          TextField(
            controller: _cashCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(prefixText: "GH₵ ", border: OutlineInputBorder()),
          ),
          const SizedBox(height: 16),
          const Text("Notes (optional)", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
          const SizedBox(height: 8),
          TextField(
            controller: _notesCtrl,
            decoration: const InputDecoration(hintText: "Anything worth noting about this shift", border: OutlineInputBorder()),
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
                : const Text("Close Shift"),
          ),
        ]),
      ),
    );
  }

  Widget _buildResult(BuildContext context) {
    final r = _result!;
    final variance = (r["variance"] as num).toDouble();
    final flagged = r["flagged"] == true;
    final expected = (r["closing_cash_expected"] as num).toDouble();
    final actual = (r["closing_cash_actual"] as num).toDouble();
    final txCount = r["transaction_count"];

    final color = flagged ? AppTheme.errorColor : AppTheme.primaryColor;
    final varianceLabel = variance == 0
        ? "Exact match"
        : variance > 0
            ? "GH₵ ${variance.toStringAsFixed(2)} surplus"
            : "GH₵ ${(-variance).toStringAsFixed(2)} short";

    return Scaffold(
      appBar: AppBar(title: const Text("Shift Closed")),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: color.withOpacity(0.08), borderRadius: BorderRadius.circular(14)),
            child: Column(children: [
              Icon(flagged ? Icons.warning_amber_rounded : Icons.check_circle, color: color, size: 48),
              const SizedBox(height: 12),
              Text(varianceLabel, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: color)),
              if (flagged) ...[
                const SizedBox(height: 4),
                const Text(
                  "This variance is large enough to be flagged for your manager/owner.",
                  style: TextStyle(fontSize: 11, color: Colors.grey),
                  textAlign: TextAlign.center,
                ),
              ],
            ]),
          ),
          const SizedBox(height: 20),
          _SummaryRow(label: "Expected cash", value: "GH₵ ${expected.toStringAsFixed(2)}"),
          _SummaryRow(label: "Actual cash counted", value: "GH₵ ${actual.toStringAsFixed(2)}"),
          _SummaryRow(label: "Transactions this shift", value: "$txCount"),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: () => context.pop(),
            child: const Text("Done"),
          ),
        ]),
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  const _SummaryRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(label, style: const TextStyle(color: Colors.grey, fontSize: 13)),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
      ]),
    );
  }
}
