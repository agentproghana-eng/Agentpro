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
    return Column(children: [
      // Fixed header - deliberately OUTSIDE the CustomScrollView below,
      // not a SliverAppBar. The previous SliverAppBar had pinned: true,
      // but that only keeps an empty bar SHAPE pinned once collapsed -
      // the actual logo/name/company/role content still scrolled away
      // and disappeared. Living outside the scrollable area entirely is
      // what makes it genuinely frozen. SafeArea(bottom: false) handles
      // the status bar instead of a hardcoded top padding guess.
      SafeArea(
        bottom: false,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          decoration: const BoxDecoration(
            gradient: LinearGradient(colors: [AppTheme.primaryColor, Color(0xFF004D43)], begin: Alignment.topLeft, end: Alignment.bottomRight),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Center(child: Image.asset("assets/images/agentpro-logo-lockup.png", height: 132)),
            const SizedBox(height: 6),
            Text("${widget.user["first_name"] ?? ""} ${widget.user["last_name"] ?? ""}", style: const TextStyle(color: AppTheme.secondaryColor, fontSize: 15, fontWeight: FontWeight.w800)),
            Text(widget.user["company_name"] ?? "", style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w600)),
            Text((widget.user["role"] ?? "").toString().replaceAll("_", " ").toUpperCase(), style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.6)),
          ]),
        ),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: _load,
          child: CustomScrollView(slivers: [
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
                  mainAxisSpacing: 6,
                  crossAxisSpacing: 6,
                  childAspectRatio: 0.9,
                  children: _quickActionTiles(context),
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
        ),
      ),
    ]);
  }

  // MTN/AirtelTigo keep the original 9-tile grid unchanged. Telecel gets
  // its own grid using Telecel's own terminology (Deposit/Withdrawal,
  // matching its real USSD menu language) - Deposit and Withdrawal are
  // fully wired (Deposit via the Accessibility Service automation,
  // Withdrawal as manual entry since e-cash moves directly SIM-to-SIM).
  // The remaining four still need their USSD menu paths mapped via
  // live-device testing before they can be built - shown here as muted
  // placeholders rather than navigating anywhere broken.
  List<Widget> _quickActionTiles(BuildContext context) {
    if (_provider != "telecel") {
      return [
        _QuickAction(icon: Icons.call_received, label: "Cash In", bgColor: const Color(0xFFE6F4F1), iconColor: AppTheme.primaryColor, onTap: () => context.push("/transactions?type=cash_in&provider=$_provider")),
        _QuickAction(icon: Icons.call_made, label: "Cash Out", bgColor: const Color(0xFFFDF3DC), iconColor: const Color(0xFFB87E00), onTap: () => context.push("/transactions?type=cash_out&provider=$_provider")),
        _QuickAction(icon: Icons.send, label: "Send Money", bgColor: const Color(0xFFE3EEFC), iconColor: const Color(0xFF2E6FD9), onTap: () => context.push("/transactions?type=send_money&provider=$_provider")),
        _QuickAction(icon: Icons.storefront, label: "Pay Merchant", bgColor: const Color(0xFFF0E6FA), iconColor: const Color(0xFF8B5FBF), onTap: () => context.push("/transactions?type=merchant_payment&provider=$_provider")),
        _QuickAction(icon: Icons.receipt_long, label: "Bill Pay", bgColor: const Color(0xFFFCE8E3), iconColor: const Color(0xFFC1503D), onTap: () => context.push("/transactions?type=bill_payment&provider=$_provider")),
        _QuickAction(icon: Icons.phone_android, label: "Airtime", bgColor: const Color(0xFFFFF7D6), iconColor: const Color(0xFFA6821A), onTap: () => context.push("/transactions?type=airtime&provider=$_provider")),
        _QuickAction(icon: Icons.wifi, label: "Data Bundle", bgColor: const Color(0xFFE0F7F5), iconColor: const Color(0xFF14847A), onTap: () => context.push("/transactions?type=data_bundle&provider=$_provider")),
        _QuickAction(icon: Icons.account_balance_wallet, label: "Check Balance", bgColor: const Color(0xFFDFF3EE), iconColor: const Color(0xFF1F8A6F), onTap: () => context.push("/transactions?type=balance_enquiry&provider=$_provider")),
        _QuickAction(icon: Icons.pie_chart, label: "Check Commission", bgColor: const Color(0xFFFBE6EC), iconColor: const Color(0xFFB33F6B), onTap: () => context.push("/my-balance")),
      ];
    }

    void comingSoon(String feature) => ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text("$feature automation is coming soon for Telecel")));

    return [
      _QuickAction(icon: Icons.call_received, label: "Deposit", bgColor: const Color(0xFFE6F4F1), iconColor: AppTheme.primaryColor, onTap: () => context.push("/transactions?type=cash_in&provider=telecel")),
      _QuickAction(icon: Icons.call_made, label: "Withdrawal", bgColor: const Color(0xFFFDF3DC), iconColor: const Color(0xFFB87E00), onTap: () => context.push("/transactions?type=cash_out&provider=telecel")),
      _QuickAction(icon: Icons.phone_android, label: "Airtime", bgColor: Colors.grey[200]!, iconColor: Colors.grey, onTap: () => comingSoon("Airtime")),
      _QuickAction(icon: Icons.wifi, label: "Internet Data", bgColor: Colors.grey[200]!, iconColor: Colors.grey, onTap: () => comingSoon("Internet Data")),
      _QuickAction(icon: Icons.account_balance_wallet, label: "Balance", bgColor: Colors.grey[200]!, iconColor: Colors.grey, onTap: () => comingSoon("Balance")),
      _QuickAction(icon: Icons.pie_chart, label: "Commission", bgColor: Colors.grey[200]!, iconColor: Colors.grey, onTap: () => comingSoon("Commission")),
    ];
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
  final Color bgColor;
  final Color iconColor;

  const _QuickAction({required this.icon, required this.label, required this.onTap, required this.bgColor, required this.iconColor});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 3)]),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(
            width: 26, height: 26,
            decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(8)),
            child: Icon(icon, size: 13, color: iconColor),
          ),
          const SizedBox(height: 4),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
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
