import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:intl/intl.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";
import "../../shared/theme/app_colors.dart";
import "../../core/services/sim_card_service.dart";
import "../../shared/utils/transaction_labels.dart";
import "../../core/router/app_router.dart";

class HomeTab extends StatefulWidget {
  final Map<String, dynamic> user;
  const HomeTab({super.key, required this.user});

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> with RouteAware {
  String _provider = "mtn";
  List<dynamic> _recent = [];
  bool _loading = true;
  Map<String, SimCard?>? _simMap;
  Set<String> _disabledTypes = {};
  Map<int, String> _simPurposes = {};
  Map<String, dynamic>? _currentShift;
  bool _shiftLoading = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    routeObserver.subscribe(this, ModalRoute.of(context) as PageRoute);
  }

  @override
  void dispose() {
    routeObserver.unsubscribe(this);
    super.dispose();
  }

  // Fires when a screen pushed on top of this one (e.g. Settings >
  // SIM Purpose) gets popped, so a saved purpose change is reflected
  // immediately instead of requiring an app restart to take effect.
  @override
  void didPopNext() {
    _loadSimPurposes();
  }

  @override
  void initState() {
    super.initState();
    _load();
    _loadSimMap();
    _loadFeatureFlags();
    _loadSimPurposes();
    _loadCurrentShift();
  }

  Future<void> _loadCurrentShift() async {
    try {
      final res = await ApiClient.instance.get("/shifts/current");
      if (mounted) setState(() { _currentShift = res.data["data"]; _shiftLoading = false; });
    } catch (_) {
      if (mounted) setState(() => _shiftLoading = false);
    }
  }

  Future<void> _openShift() async {
    try {
      final res = await ApiClient.instance.post("/shifts/open");
      if (mounted) setState(() => _currentShift = res.data["data"]);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Failed to open shift")));
    }
  }

  // Shift status card - shown above the quick action tiles. Greyed
  // out/plain when no shift is open (tap to open), tinted and shows
  // elapsed time when one is - tapping Close navigates to the
  // dedicated close-shift flow and refreshes on return.
  Widget _buildShiftCard() {
    if (_shiftLoading) return const SizedBox.shrink();
    final isOpen = _currentShift != null;
    final openedAt = isOpen ? DateTime.tryParse(_currentShift!["opened_at"]?.toString() ?? "") : null;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isOpen ? context.appTileColor(const Color(0xFFE6F4F1)) : context.appSurface,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 3)],
      ),
      child: Row(children: [
        Icon(isOpen ? Icons.timer : Icons.timer_off_outlined,
            color: isOpen ? AppTheme.primaryColor : Colors.grey, size: 22),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            isOpen
                ? "Shift open since ${openedAt != null ? DateFormat('h:mm a').format(openedAt.toLocal()) : '—'}"
                : "No active shift",
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: isOpen ? AppTheme.primaryColor : context.appSecondaryText),
          ),
        ),
        ElevatedButton(
          onPressed: isOpen
              ? () => context.push("/shifts/close/${_currentShift!['id']}").then((_) => _loadCurrentShift())
              : _openShift,
          style: ElevatedButton.styleFrom(
            backgroundColor: isOpen ? AppTheme.errorColor : AppTheme.primaryColor,
            minimumSize: const Size(0, 34),
            padding: const EdgeInsets.symmetric(horizontal: 14),
          ),
          child: Text(isOpen ? "Close Shift" : "Open Shift", style: const TextStyle(fontSize: 12)),
        ),
      ]),
    );
  }

  // Fetches the admin-controlled kill-switch list once per screen load.
  // Fails silently (leaves _disabledTypes empty) on any error - a
  // feature-flag fetch failure should never block the home screen or
  // make tiles look disabled when they're actually fine; the same
  // check is enforced server-side regardless as the real safety net.
  // Lets Home dynamically switch its Quick Actions to Personal's own
  // set when the currently-selected provider's SIM has been tagged
  // 'personal' in Settings > SIM Purpose - someone holding both
  // capabilities can use their personal SIM's actions right from
  // Agent Home, without navigating away to the separate Personal
  // dashboard. Fails silently, same as feature flags - a pure Agent
  // account (no purposes ever saved) simply never triggers this.
  Future<void> _loadSimPurposes() async {
    try {
      final res = await ApiClient.instance.get('/user-sim-purposes');
      final saved = (res.data['data'] as List?) ?? [];
      final map = <int, String>{};
      for (final p in saved) {
        map[p['sim_slot'] as int] = p['purpose'] as String;
      }
      if (mounted) setState(() => _simPurposes = map);
    } catch (_) {
      // Leave _simPurposes empty - Quick Actions just stay Agent's own.
    }
  }

  bool get _isPersonalSim {
    final sim = _simMap?[_provider];
    if (sim == null) return false;
    return _simPurposes[sim.slot] == 'personal';
  }

  Future<void> _loadFeatureFlags() async {
    try {
      final res = await ApiClient.instance.get("/users/me/feature-flags");
      final list = (res.data["data"]["disabled_transaction_types"] as List?) ?? [];
      if (mounted) setState(() => _disabledTypes = list.map((e) => e.toString()).toSet());
    } catch (_) {
      // Leave _disabledTypes empty - fail open on the client, server
      // still enforces the kill-switch either way.
    }
  }

  // Renders a quick-action tile, automatically greying it out and
  // blocking navigation if an admin has disabled this provider+type
  // combo via the "disabled_transaction_types" config kill-switch.
  Widget _tile({required IconData icon, required String label, required Color bgColor, required Color iconColor, required String type, required VoidCallback onTap}) {
    final disabled = _disabledTypes.contains("$_provider:$type");
    return _QuickAction(
      icon: icon,
      label: label,
      bgColor: context.appTileColor(disabled ? Colors.grey[200]! : bgColor),
      iconColor: disabled ? Colors.grey : iconColor,
      onTap: disabled
          ? () => ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text("This feature has been temporarily disabled by your administrator.")))
          : onTap,
    );
  }

  Future<void> _loadSimMap() async {
    try {
      var map = await SimCardService.getNetworkSimMap();
      // Android's telephony state can briefly report "no SIMs" right at
      // cold app launch or just after a permission grant, before the
      // OS has fully settled - getSimCards() also swallows some
      // non-permission platform errors into an empty list rather than
      // throwing. If every provider comes back null, treat that as
      // suspicious rather than final: retry once after a short delay.
      // _simMap stays null the whole time (UI shows all 3 tabs, never
      // "Insert SIM") until we're confident the result is real.
      if (map.values.every((v) => v == null)) {
        await Future.delayed(const Duration(milliseconds: 1200));
        if (!mounted) return;
        map = await SimCardService.getNetworkSimMap();
      }
      if (!mounted) return;
      setState(() {
        _simMap = map;
        // If the currently-selected provider has no detected SIM, switch
        // to the first one that does, so the tab row never opens on a
        // tab that is about to disappear.
        if (map[_provider] == null) {
          final firstAvailable = map.entries.firstWhere((e) => e.value != null, orElse: () => map.entries.first).key;
          _provider = firstAvailable;
        }
      });
    } catch (_) {
      // Permission denied or detection failed - leave _simMap null so
      // the UI falls back to showing all three tabs rather than none.
    }
  }


  // Only shows tabs for SIMs actually present on the device. Falls
  // back to showing all three if detection has not finished yet or
  // failed (permission denied, etc.), so agents are never blocked by
  // a detection problem. If detection succeeded but found zero SIMs,
  // shows an Insert SIM message instead of an empty or misleading tab
  // row.
  List<Widget> _buildProviderTabRow() {
    final providers = _simMap == null
        ? ["mtn", "telecel", "at_money"]
        : _simMap!.entries.where((e) => e.value != null).map((e) => e.key).toList();

    if (providers.isEmpty) {
      return [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(children: [
              Icon(Icons.sim_card_alert_outlined, color: Colors.grey[500], size: 18),
              const SizedBox(width: 8),
              Text("Insert SIM", style: TextStyle(color: Colors.grey[600], fontWeight: FontWeight.w600)),
            ]),
          ),
        ),
      ];
    }

    const labels = {"mtn": "MTN", "telecel": "Telecel", "at_money": "AirtelTigo"};
    const colors = {"mtn": Color(0xFFFFCC00), "telecel": Color(0xFFE31837), "at_money": Color(0xFF003087)};

    final widgets = <Widget>[];
    for (var i = 0; i < providers.length; i++) {
      final p = providers[i];
      widgets.add(Expanded(child: _ProviderTab(
        label: labels[p]!,
        value: p,
        selected: _provider == p,
        color: colors[p]!,
        onTap: (v) {
          setState(() => _provider = v);
          _load();
        },
      )));
      if (i < providers.length - 1) widgets.add(const SizedBox(width: 4));
    }
    return widgets;
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get("/transactions", queryParameters: {"limit": 5, "provider": _provider});
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
            Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Image.asset("assets/images/agentpro-icon.png", height: 26),
                  const SizedBox(width: 8),
                  const Text.rich(TextSpan(children: [
                    TextSpan(text: "Agent", style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800)),
                    TextSpan(text: "Pro", style: TextStyle(color: AppTheme.secondaryColor, fontSize: 17, fontWeight: FontWeight.w800)),
                  ])),
                ],
              ),
            ),
            const SizedBox(height: 2),
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
                  decoration: BoxDecoration(color: context.appSurface, borderRadius: BorderRadius.circular(12), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 3)]),
                  child: Row(children: _buildProviderTabRow()),
                ),
              ),
            ),
            SliverToBoxAdapter(child: _buildShiftCard()),
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
  // Three MTN Commissions-menu actions confirmed via live device
  // mapping: two balance checks (Commission Balance, Cash In
  // Balance) plus the actual Transfer Commission to e-Float dial -
  // the same real USSD flow reachable from the My Balance screen,
  // offered here too since it lives in the same MTN menu as the
  // other two. All three are recorded as real transactions.
  Future<void> _showCommissionCheckPicker(BuildContext context) async {
    final choice = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Check Commission'),
        children: [
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx, 'commission_balance'),
            child: const Text('Commission Balance'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx, 'cash_in_commission'),
            child: const Text('Cash In Balance'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx, 'commission_transfer'),
            child: const Text('Transfer Commission to e-Float'),
          ),
        ],
      ),
    );
    if (choice == null || !context.mounted) return;
    if (choice == 'commission_transfer') {
      context.push('/balances/commission-transfer', extra: {'provider': 'mtn'});
    } else {
      context.push('/transactions?type=$choice&provider=mtn');
    }
  }

  List<Widget> _quickActionTiles(BuildContext context) {
    if (_isPersonalSim) return _personalQuickActionTiles(context);

    if (_provider != "telecel") {
      return [
        _tile(icon: Icons.call_received, label: "Cash In", bgColor: const Color(0xFFE6F4F1), iconColor: AppTheme.primaryColor, type: "cash_in", onTap: () => context.push("/transactions?type=cash_in&provider=$_provider")),
        _tile(icon: Icons.call_made, label: "Cash Out", bgColor: const Color(0xFFFDF3DC), iconColor: const Color(0xFFB87E00), type: "cash_out", onTap: () => context.push("/transactions?type=cash_out&provider=$_provider")),
        _tile(icon: Icons.send, label: "Send Money", bgColor: const Color(0xFFE3EEFC), iconColor: const Color(0xFF2E6FD9), type: "send_money", onTap: () => context.push("/transactions?type=send_money&provider=$_provider")),
        _tile(icon: Icons.storefront, label: "Pay to Merchant", bgColor: const Color(0xFFF0E6FA), iconColor: const Color(0xFF8B5FBF), type: "merchant_payment", onTap: () => context.push("/transactions?type=merchant_payment&provider=$_provider")),
        _tile(icon: Icons.receipt_long, label: "Pay to Agent", bgColor: const Color(0xFFFCE8E3), iconColor: const Color(0xFFC1503D), type: "bill_payment", onTap: () => context.push("/transactions?type=bill_payment&provider=$_provider")),
        _tile(icon: Icons.phone_android, label: "Airtime", bgColor: const Color(0xFFFFF7D6), iconColor: const Color(0xFFA6821A), type: "airtime", onTap: () => context.push("/transactions?type=airtime&provider=$_provider")),
        _tile(icon: Icons.wifi, label: "Data Bundle", bgColor: const Color(0xFFE0F7F5), iconColor: const Color(0xFF14847A), type: "data_bundle", onTap: () => context.push("/transactions?type=data_bundle&provider=$_provider")),
        _tile(icon: Icons.account_balance_wallet, label: "Check Balance", bgColor: const Color(0xFFDFF3EE), iconColor: const Color(0xFF1F8A6F), type: "balance_enquiry", onTap: () => context.push("/transactions?type=balance_enquiry&provider=$_provider")),
        _QuickAction(icon: Icons.pie_chart, label: "Check Commission", bgColor: context.appTileColor(const Color(0xFFFBE6EC)), iconColor: const Color(0xFFB33F6B), onTap: () => _showCommissionCheckPicker(context)),
      ];
    }

    void comingSoon(String feature) => ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text("$feature automation is coming soon for Telecel")));

    return [
      _tile(icon: Icons.call_received, label: "Deposit", bgColor: const Color(0xFFE6F4F1), iconColor: AppTheme.primaryColor, type: "cash_in", onTap: () => context.push("/transactions?type=cash_in&provider=telecel")),
      _tile(icon: Icons.call_made, label: "Withdrawal", bgColor: const Color(0xFFFDF3DC), iconColor: const Color(0xFFB87E00), type: "cash_out", onTap: () => context.push("/transactions?type=cash_out&provider=telecel")),
      _tile(icon: Icons.phone_android, label: "Airtime", bgColor: const Color(0xFFFFF7D6), iconColor: const Color(0xFFA6821A), type: "airtime", onTap: () => context.push("/transactions?type=airtime&provider=telecel")),
      _QuickAction(icon: Icons.wifi, label: "Internet Data", bgColor: context.appTileColor(Colors.grey[200]!), iconColor: Colors.grey, onTap: () => comingSoon("Internet Data")),
      _QuickAction(icon: Icons.account_balance_wallet, label: "Balance", bgColor: context.appTileColor(Colors.grey[200]!), iconColor: Colors.grey, onTap: () => comingSoon("Balance")),
      _QuickAction(icon: Icons.pie_chart, label: "Commission", bgColor: context.appTileColor(Colors.grey[200]!), iconColor: Colors.grey, onTap: () => comingSoon("Commission")),
    ];
  }

  // Same 7 actions and dial behavior as PersonalHomeScreen's own quick
  // actions - routes into the exact same /personal-transactions/new
  // flow (Personal's own dialing/USSD logic, not Agent's), just
  // reached from within Agent Home instead of the separate Personal
  // dashboard. Labels match PersonalHomeScreen's grid exactly (short,
  // \n-split for the 3x grid), not kPersonalTransactionLabels' longer
  // single-line versions used elsewhere (e.g. screen titles).
  List<Widget> _personalQuickActionTiles(BuildContext context) {
    final sim = _simMap?[_provider];
    void go(String type) {
      final query = <String, String>{
        'type': type,
        'provider': _provider,
        if (sim != null) 'sim_slot': sim.slot.toString(),
        if (sim != null) 'sim_iccid': sim.iccid,
      };
      context.push(Uri(path: '/personal-transactions/new', queryParameters: query).toString());
    }
    return [
      _tile(icon: Icons.send_outlined, label: "Send Money\n(Same Network)", bgColor: const Color(0xFFE6F4F1), iconColor: AppTheme.primaryColor, type: 'send_money_same_network', onTap: () => go('send_money_same_network')),
      _tile(icon: Icons.compare_arrows, label: "Send Money\n(Other Network)", bgColor: const Color(0xFFE3EEFC), iconColor: const Color(0xFF2E6FD9), type: 'send_money_cross_network', onTap: () => go('send_money_cross_network')),
      _tile(icon: Icons.phone_android_outlined, label: "Buy Airtime", bgColor: const Color(0xFFFFF7D6), iconColor: const Color(0xFFA6821A), type: 'buy_airtime', onTap: () => go('buy_airtime')),
      _tile(icon: Icons.wifi_outlined, label: "Buy Data", bgColor: const Color(0xFFE0F7F5), iconColor: const Color(0xFF14847A), type: 'buy_data', onTap: () => go('buy_data')),
      _tile(icon: Icons.card_giftcard_outlined, label: "Mash Up", bgColor: const Color(0xFFF0E6FA), iconColor: const Color(0xFF8B5FBF), type: 'buy_mashup', onTap: () => go('buy_mashup')),
      _tile(icon: Icons.account_balance_wallet_outlined, label: "Check MoMo\nBalance", bgColor: const Color(0xFFDFF3EE), iconColor: const Color(0xFF1F8A6F), type: 'check_momo_balance', onTap: () => go('check_momo_balance')),
      _tile(icon: Icons.sim_card_outlined, label: "Check Airtime\nBalance", bgColor: const Color(0xFFFDF3DC), iconColor: const Color(0xFFB87E00), type: 'check_airtime_balance', onTap: () => go('check_airtime_balance')),
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
        child: Text(label, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: selected ? (color == const Color(0xFFFFCC00) ? Colors.black : Colors.white) : context.appSecondaryText)),
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
        decoration: BoxDecoration(color: context.appSurface, borderRadius: BorderRadius.circular(10), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 3)]),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(
            width: 39, height: 39,
            decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(8)),
            child: Icon(icon, size: 20, color: iconColor),
          ),
          const SizedBox(height: 4),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
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

    return GestureDetector(
      onTap: () => context.push('/transactions/${tx["id"]}'),
      child: Container(
        padding: const EdgeInsets.all(11),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(color: context.appSurface, borderRadius: BorderRadius.circular(12), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 3)]),
        child: Row(children: [
        Container(
          width: 34, height: 34,
          decoration: BoxDecoration(color: isCashIn ? context.appTileColor(const Color(0xFFE6F4F1)) : context.appTileColor(const Color(0xFFFDF3DC)), borderRadius: BorderRadius.circular(9)),
          child: Icon(isCashIn ? Icons.call_received : Icons.call_made, size: 16, color: isCashIn ? AppTheme.primaryColor : const Color(0xFFB87E00)),
        ),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(transactionTypeLabel(type, (tx["provider"] ?? "").toString()), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold)),
          Text("${tx["customer_phone"] ?? ""} · $timeStr", style: const TextStyle(fontSize: 10.5, color: Colors.grey, fontWeight: FontWeight.w700)),
        ])),
        Text("${isCashIn ? "+" : "-"}GH₵${amount.toStringAsFixed(2)}", style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: isCashIn ? AppTheme.primaryColor : const Color(0xFFB33F3F))),
        ]),
      ),
    );
  }
}
