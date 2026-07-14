import "package:flutter/material.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";

class UssdSettingsScreen extends StatefulWidget {
  const UssdSettingsScreen({super.key});

  @override
  State<UssdSettingsScreen> createState() => _UssdSettingsScreenState();
}

class _UssdSettingsScreenState extends State<UssdSettingsScreen> {
  String _provider = "mtn";
  String _transactionType = "cash_out";
  final _patternCtrl = TextEditingController();
  List<dynamic> _overrides = [];
  bool _loading = true;
  bool _saving = false;
  String? _error;

  final _types = ["cash_in", "cash_out", "send_money", "airtime", "data_bundle"];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get("/ussd-overrides");
      setState(() {
        _overrides = res.data["data"] ?? [];
        _loading = false;
        _syncPatternField();
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  Map<String, dynamic>? get _currentOverride => _overrides.cast<Map<String, dynamic>?>().firstWhere(
        (o) => o!["provider"] == _provider && o["transaction_type"] == _transactionType,
        orElse: () => null,
      );

  void _syncPatternField() {
    final existing = _currentOverride;
    _patternCtrl.text = existing != null ? existing["ussd_string_pattern"] : "";
  }

  Future<void> _save() async {
    final pattern = _patternCtrl.text.trim();
    if (!pattern.startsWith("*") || !pattern.endsWith("#")) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Pattern must start with * and end with #")));
      return;
    }
    setState(() => _saving = true);
    try {
      await ApiClient.instance.put("/ussd-overrides", data: {
        "provider": _provider,
        "transaction_type": _transactionType,
        "ussd_string_pattern": pattern,
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Custom pattern saved")));
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Failed to save pattern"), backgroundColor: AppTheme.errorColor));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _reset() async {
    final existing = _currentOverride;
    if (existing == null) return;
    setState(() => _saving = true);
    try {
      await ApiClient.instance.delete("/ussd-overrides/${existing["id"]}");
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Reset to company default")));
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Failed to reset"), backgroundColor: AppTheme.errorColor));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _providerLabel(String p) {
    switch (p) {
      case "mtn": return "MTN";
      case "telecel": return "Telecel";
      case "at_money": return "AirtelTigo";
      default: return p;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return Scaffold(
      appBar: AppBar(title: const Text("USSD Automation")),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text("Provider", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
        const SizedBox(height: 8),
        Row(children: [
          _ProviderPill(label: "MTN", value: "mtn", selected: _provider == "mtn", onTap: (v) => setState(() { _provider = v; _syncPatternField(); })),
          const SizedBox(width: 6),
          _ProviderPill(label: "Telecel", value: "telecel", selected: _provider == "telecel", onTap: (v) => setState(() { _provider = v; _syncPatternField(); })),
          const SizedBox(width: 6),
          _ProviderPill(label: "AirtelTigo", value: "at_money", selected: _provider == "at_money", onTap: (v) => setState(() { _provider = v; _syncPatternField(); })),
        ]),
        const SizedBox(height: 16),
        const Text("Transaction Type", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: _transactionType,
              isExpanded: true,
              items: _types.map((t) => DropdownMenuItem(value: t, child: Text(t.replaceAll("_", " ")))).toList(),
              onChanged: (v) => setState(() { _transactionType = v!; _syncPatternField(); }),
            ),
          ),
        ),
        const SizedBox(height: 16),
        const Text("Your USSD Pattern", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
        const SizedBox(height: 8),
        TextField(
          controller: _patternCtrl,
          style: const TextStyle(fontFamily: "monospace"),
          decoration: const InputDecoration(hintText: "*170*1*2*{customer_phone}*{amount}#", border: OutlineInputBorder()),
        ),
        const Padding(
          padding: EdgeInsets.only(top: 4),
          child: Text("Placeholders: {customer_phone}, {amount}, {reference}", style: TextStyle(fontSize: 9.5, color: Colors.grey)),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: const Color(0xFFFBE4E4), borderRadius: BorderRadius.circular(10)),
          child: const Text("Never include a MoMo PIN in this pattern. The app can never dial, store, or see your PIN — it is always entered on the network's own screen.", style: TextStyle(fontSize: 10.5, color: Color(0xFFA33333))),
        ),
        const SizedBox(height: 16),
        if (_currentOverride != null)
          Center(child: TextButton(onPressed: _saving ? null : _reset, child: const Text("Reset to Company Default"))),
        const SizedBox(height: 8),
        ElevatedButton(
          onPressed: _saving ? null : _save,
          child: _saving
              ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text("Save Custom Pattern"),
        ),
      ]),
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
