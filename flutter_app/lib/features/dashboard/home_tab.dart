import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:intl/intl.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";

class HomeTab extends StatefulWidget {
  final Map<String, dynamic> user;
  const HomeTab({super.key, required this.user});

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  String _provider = "mtn";
  List<dynamic> _recent = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get("/transactions", queryParameters: {"limit": 5});
      setState(() {
        _recent = res.data["data"] ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: CustomScrollView(slivers: [
        SliverAppBar(
          pinned: true,
          backgroundColor: AppTheme.primaryColor,
          expandedHeight: 168,
          flexibleSpace: FlexibleSpaceBar(
            background: Container(
              padding: const EdgeInsets.fromLTRB(20, 50, 20, 12),
              decoration: const BoxDecoration(
                gradient: LinearGradient(colors: [AppTheme.primaryColor, Color(0xFF004D43)], begin: Alignment.topLeft, end: Alignment.bottomRight),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.end, children: [
                Center(child: Image.asset("assets/images/agentpro-logo-lockup.png", height: 26)),
                const SizedBox(height: 10),
                Text("${widget.user["first_name"] ?? ""} ${widget.user["last_name"] ?? ""}", style: const TextStyle(color: Colors.white, fontSize: 14.5, fontWeight: FontWeight.bold)),
                Text(widget.user["company_name"] ?? "", style: const TextStyle(color: Colors.white70, fontSize: 12)),
              ]),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 3)]),
              child: Row(children: [
                Expanded(child: _ProviderTab(label: "MTN", value: "mtn", selected: _provider == "mtn", color: const Color(0xFFFFCC00), onTap: (v) => setState(() => _provider = v))),
                const SizedBox(width: 4),
                Expanded(child: _ProviderTab(label: "Telecel", value: "telecel", selected: _provider == "telecel", color: const Color(0xFFE31837), onTap: (v) => setState(() => _provider = v))),
                const SizedBox(width: 4),
                Expanded(child: _ProviderTab(label: "AirtelTigo", value: "at_money", selected: _provider == "at_money", color: const Color(0xFF003087), onTap: (v) => setState(() => _provider = v))),
              ]),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
          sliver: SliverToBoxAdapter(
            child: GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 0.95,
              children: [
                _QuickAction(icon: Icons.call_received, label: "Cash In", onTap: () => context.push("/transactions?type=cash_in")),
                _QuickAction(icon: Icons.call_made, label: "Cash Out", onTap: () => context.push("/transactions?type=cash_out")),
                _QuickAction(icon: Icons.send, label: "Send Money", onTap: () => context.push("/transactions?type=send_money")),
                _QuickAction(icon: Icons.storefront, label: "Pay Merchant", onTap: () => context.push("/transactions?type=merchant_payment")),
                _QuickAction(icon: Icons.receipt_long, label: "Bill Pay", onTap: () => context.push("/transactions?type=bill_payment")),
                _QuickAction(icon: Icons.phone_android, label: "Airtime", onTap: () => context.push("/transactions?type=airtime")),
                _QuickAction(icon: Icons.wifi, label: "Data Bundle", onTap: () => context.push("/transactions?type=data_bundle")),
                _QuickAction(icon: Icons.account_balance_wallet, label: "Check Balance", onTap: () => context.push("/transactions?type=balance_enquiry")),
                _QuickAction(icon: Icons.pie_chart, label: "Check Commission", onTap: () => context.push("/my-balance")),
              ],
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          sliver: SliverToBoxAdapter(
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              const Text("Recent Transactions", style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
              GestureDetector(onTap: () => context.push("/transactions/history"), child: const Text("See All", style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.primaryColor))),
            ]),
          ),
        ),
        if (_loading)
          const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator())))
        else if (_recent.isEmpty)
          const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(20), child: Center(child: Text("No transactions yet"))))
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
            sliver: SliverList(delegate: SliverChildBuilderDelegate(
              (context, i) => _RecentTxItem(tx: _recent[i] as Map<String, dynamic>),
              childCount: _recent.length,
            )),
          ),
      ]),
    );
  }
}

class _ProviderTab extends StatelessWidget {
  final String label;
  final String value;
  final bool selected;
  final Color color;
  final void Function(String) onTap;

  const _ProviderTab({required this.label, required this.value, required this.selected, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => onTap(value),
      borderRadius: BorderRadius.circular(9),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: BoxDecoration(color: selected ? color : Colors.transparent, borderRadius: BorderRadius.circular(9)),
        child: Text(label, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: selected ? (color == const Color(0xFFFFCC00) ? Colors.black : Colors.white) : Colors.grey)),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickAction({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 3)]),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon, size: 22, color: AppTheme.primaryColor),
          const SizedBox(height: 6),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w600)),
        ]),
      ),
    );
  }
}

class _RecentTxItem extends StatelessWidget {
  final Map<String, dynamic> tx;
  const _RecentTxItem({required this.tx});

  @override
  Widget build(BuildContext context) {
    final type = (tx["transaction_type"] ?? "").toString();
    final isCashIn = type == "cash_in";
    final amount = double.tryParse(tx["amount"].toString()) ?? 0;
    DateTime? created;
    try { created = DateTime.parse(tx["created_at"].toString()); } catch (e) {}
    final timeStr = created != null ? DateFormat("HH:mm").format(created.toLocal()) : "";

    return Container(
      padding: const EdgeInsets.all(11),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 3)]),
      child: Row(children: [
        Container(
          width: 34, height: 34,
          decoration: BoxDecoration(color: isCashIn ? const Color(0xFFE6F4F1) : const Color(0xFFFDF3DC), borderRadius: BorderRadius.circular(9)),
          child: Icon(isCashIn ? Icons.call_received : Icons.call_made, size: 16, color: isCashIn ? AppTheme.primaryColor : const Color(0xFFB87E00)),
        ),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(type.replaceAll("_", " "), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold)),
          Text("${tx["customer_phone"] ?? ""} · $timeStr", style: const TextStyle(fontSize: 10.5, color: Colors.grey)),
        ])),
        Text("${isCashIn ? "+" : "-"}GH₵${amount.toStringAsFixed(2)}", style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: isCashIn ? AppTheme.primaryColor : const Color(0xFFB33F3F))),
      ]),
    );
  }
}
