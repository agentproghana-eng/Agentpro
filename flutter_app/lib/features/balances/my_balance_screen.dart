import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";
import "../../shared/theme/app_colors.dart";
import "../../shared/widgets/app_widgets.dart";
import "../../core/services/sim_card_service.dart";

class MyBalanceScreen extends StatefulWidget {
  const MyBalanceScreen({super.key});

  @override
  State<MyBalanceScreen> createState() => _MyBalanceScreenState();
}

class _MyBalanceScreenState extends State<MyBalanceScreen> {
  List<dynamic> _balances = [];
  bool _loading = true;
  String? _error;
  Map<String, SimCard?>? _simMap;

  @override
  void initState() {
    super.initState();
    _load();
    _loadSimMap();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await ApiClient.instance.get("/balances");
      setState(() {
        _balances = res.data["data"] ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = "Could not load balances"; _loading = false; });
    }
  }

  // Mirrors the Home tab's SIM-detection pattern: retry once if every
  // provider comes back null (brief cold-launch blip), and never block
  // the screen on detection failure - _simMap stays null so every
  // balance is shown rather than risk hiding real data.
  Future<void> _loadSimMap() async {
    try {
      var map = await SimCardService.getNetworkSimMap();
      if (map.values.every((v) => v == null)) {
        await Future.delayed(const Duration(milliseconds: 1200));
        if (!mounted) return;
        map = await SimCardService.getNetworkSimMap();
      }
      if (!mounted) return;
      setState(() => _simMap = map);
    } catch (_) {
      // Permission denied or detection failed - leave _simMap null so
      // every balance is shown rather than none.
    }
  }

  String _fmt(dynamic v) => (double.tryParse(v?.toString() ?? "0") ?? 0).toStringAsFixed(2);

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
    final noSimsDetected = _simMap != null && _simMap!.values.every((v) => v == null);
    final visibleBalances = _simMap == null
        ? _balances
        : _balances.where((b) => _simMap![b["provider"]] != null).toList();
    return Scaffold(
      appBar: AppBar(title: const Text("My Balance")),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : noSimsDetected
                  ? const EmptyState(
                      icon: Icons.sim_card_alert,
                      title: "No SIM Card Detected",
                      subtitle: "Insert a SIM card to view your float balances.",
                    )
                  : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: visibleBalances.length,
                    itemBuilder: (_, i) {
                      final b = visibleBalances[i] as Map<String, dynamic>;
                      return _ProviderBalanceCard(
                        providerLabel: _providerLabel(b["provider"]),
                        provider: b["provider"],
                        eFloat: _fmt(b["e_float_balance"]),
                        cash: _fmt(b["cash_at_hand"]),
                        commission: _fmt(b["commission_balance"]),
                        onChanged: _load,
                      );
                    },
                  ),
                ),
    );
  }
}

class _ProviderBalanceCard extends StatelessWidget {
  final String providerLabel;
  final String provider;
  final String eFloat;
  final String cash;
  final String commission;
  final VoidCallback onChanged;

  const _ProviderBalanceCard({
    required this.providerLabel,
    required this.provider,
    required this.eFloat,
    required this.cash,
    required this.commission,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8, top: 8),
          child: Text(providerLabel, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
        ),
        _BalanceCard(label: "e-Float", amount: eFloat, colorStart: AppTheme.primaryColor, colorEnd: const Color(0xFF004D43), tag: "ELECTRONIC"),
        const SizedBox(height: 10),
        _BalanceCard(label: "Cash at Hand", amount: cash, colorStart: const Color(0xFFB87E00), colorEnd: const Color(0xFF8A6300), tag: "PHYSICAL"),
        const SizedBox(height: 10),
        _BalanceCard(label: "Commission", amount: commission, colorStart: const Color(0xFF5B4B8A), colorEnd: const Color(0xFF3E3260), tag: "ELECTRONIC"),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: _ActionChip(icon: Icons.call_received, label: "Declare Float", route: "/balances/float-received", provider: provider, onChanged: onChanged)),
          const SizedBox(width: 8),
          Expanded(child: _ActionChip(icon: Icons.payments_outlined, label: "Adjust Cash", route: "/balances/cash-adjustment", provider: provider, onChanged: onChanged)),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: _ActionChip(icon: Icons.swap_horiz, label: "Transfer Commission to e-Float", route: "/balances/commission-transfer", provider: provider, onChanged: onChanged)),
        ]),
        const SizedBox(height: 24),
      ],
    );
  }
}

class _BalanceCard extends StatelessWidget {
  final String label;
  final String amount;
  final Color colorStart;
  final Color colorEnd;
  final String tag;

  const _BalanceCard({
    required this.label,
    required this.amount,
    required this.colorStart,
    required this.colorEnd,
    required this.tag,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [colorStart, colorEnd]),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text(label.toUpperCase(), style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.bold, fontSize: 11, letterSpacing: 0.5)),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(7)),
              child: Text(tag, style: const TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold)),
            ),
          ]),
          const SizedBox(height: 6),
          Text("GH₵ $amount", style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final String route;
  final String provider;
  final VoidCallback onChanged;

  const _ActionChip({
    required this.icon,
    required this.label,
    required this.route,
    required this.provider,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(11),
      onTap: () async {
        await context.push(route, extra: {"provider": provider});
        onChanged();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
        decoration: BoxDecoration(
          color: context.appSurface,
          borderRadius: BorderRadius.circular(11),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 3, offset: const Offset(0, 1))],
        ),
        child: Column(children: [
          Icon(icon, size: 18, color: AppTheme.primaryColor),
          const SizedBox(height: 4),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold)),
        ]),
      ),
    );
  }
}
