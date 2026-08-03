import "dart:async";
import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:go_router/go_router.dart";
import "package:intl/intl.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";
import "../../shared/theme/app_colors.dart";
import "../../core/services/sim_card_service.dart";
import "../../core/services/dashboard_refresh_service.dart";
import "../../shared/utils/transaction_labels.dart";
import "../../core/router/app_router.dart";
import "../ussd_settings/quick_action_customization_screen.dart";
import "../../shared/widgets/offline_status_banner.dart";
import "../../shared/widgets/dashboard_skeleton.dart";

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
  Map<String, List<String>> _agentQuickActions = {};
  Map<String, List<String>> _personalQuickActions = {};
  StreamSubscription<DashboardRefreshEvent>? _dashboardRefreshSubscription;
  bool _highlightNewestTransaction = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    routeObserver.subscribe(this, ModalRoute.of(context) as PageRoute);
  }

  @override
  void dispose() {
    routeObserver.unsubscribe(this);
    _dashboardRefreshSubscription?.cancel();
    super.dispose();
  }

  // Fires when a screen pushed on top of this one (e.g. Settings >
  // SIM Purpose) gets popped, so a saved purpose change is reflected
  // immediately instead of requiring an app restart to take effect.
  @override
  void didPopNext() {
    _loadSimPurposes();
    _loadQuickActions();
  }

  @override
  void initState() {
    super.initState();

    _dashboardRefreshSubscription = DashboardRefreshService.events.listen(
      _handleDashboardRefresh,
    );

    _load();
    _loadSimMap();
    _loadFeatureFlags();
    _loadSimPurposes();
    _loadCurrentShift();
    _loadQuickActions();
  }

  Future<void> _handleDashboardRefresh(DashboardRefreshEvent event) async {
    if (event.isPersonal || !mounted) return;

    if (_provider != event.provider) {
      setState(() => _provider = event.provider);
    }

    await Future.wait([_load(), _loadCurrentShift()]);

    if (!mounted || _recent.isEmpty) return;

    setState(() => _highlightNewestTransaction = true);

    await Future.delayed(const Duration(milliseconds: 1400));

    if (mounted) {
      setState(() => _highlightNewestTransaction = false);
    }
  }

  Widget _animateNewestTransaction({
    required Widget child,
    required bool isNewest,
  }) {
    if (!isNewest) return child;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 450),
      curve: Curves.easeOutCubic,
      transform: Matrix4.translationValues(
        0,
        _highlightNewestTransaction ? 0 : 4,
        0,
      ),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(13),
        border: Border.all(
          color: _highlightNewestTransaction
              ? AppTheme.primaryColor.withOpacity(0.42)
              : Colors.transparent,
        ),
      ),
      child: child,
    );
  }

  Future<void> _loadQuickActions() async {
    try {
      final response = await ApiClient.instance.get("/users/me/quick-actions");
      final data =
          response.data["data"] as Map<String, dynamic>? ?? <String, dynamic>{};

      Map<String, List<String>> parseProfile(dynamic raw) {
        final result = <String, List<String>>{};
        if (raw is! Map) return result;

        for (final provider in ["mtn", "telecel", "at_money"]) {
          final value = raw[provider];
          if (value is List) {
            result[provider] = value.whereType<String>().take(9).toList();
          }
        }

        return result;
      }

      if (!mounted) return;

      setState(() {
        _agentQuickActions = parseProfile(data["agent"]);
        _personalQuickActions = parseProfile(data["personal"]);
      });
    } catch (_) {
      // Keep provider-specific defaults when preferences cannot be loaded.
    }
  }

  List<String> _quickActionTypes({required bool personal}) {
    final saved = personal
        ? _personalQuickActions[_provider]
        : _agentQuickActions[_provider];

    if (saved != null) {
      return saved.take(9).toList();
    }

    final defaults = personal
        ? kPersonalQuickActionDefaults[_provider]
        : kAgentQuickActionDefaults[_provider];

    return List<String>.from(defaults ?? const <String>[]).take(9).toList();
  }

  QuickActionDefinition? _quickActionDefinition(
    String type, {
    required bool personal,
  }) {
    final definitions = personal
        ? kPersonalQuickActionDefinitions
        : kAgentQuickActionDefinitions;

    for (final definition in definitions) {
      if (definition.type == type) return definition;
    }

    return null;
  }

  Future<void> _loadCurrentShift() async {
    try {
      final res = await ApiClient.instance.get("/shifts/current");
      if (mounted)
        setState(() {
          _currentShift = res.data["data"];
          _shiftLoading = false;
        });
    } catch (_) {
      if (mounted) setState(() => _shiftLoading = false);
    }
  }

  Future<void> _openShift() async {
    try {
      final res = await ApiClient.instance.post("/shifts/open");
      if (mounted) setState(() => _currentShift = res.data["data"]);
    } catch (_) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text("Failed to open shift")));
    }
  }

  // Shift status card - shown above the quick action tiles. Greyed
  // out/plain when no shift is open (tap to open), tinted and shows
  // elapsed time when one is - tapping Close navigates to the
  // dedicated close-shift flow and refreshes on return.
  Widget _buildShiftCard() {
    if (_shiftLoading) return const ShiftCardSkeleton();
    final isOpen = _currentShift != null;
    final openedAt = isOpen
        ? DateTime.tryParse(_currentShift!["opened_at"]?.toString() ?? "")
        : null;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      decoration: BoxDecoration(
        color: isOpen
            ? context.appTileColor(const Color(0xFFDDF3EE))
            : context.appSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isOpen
              ? AppTheme.primaryColor.withOpacity(0.18)
              : context.appSecondaryText.withOpacity(0.10),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.055),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: isOpen
                  ? AppTheme.primaryColor.withOpacity(0.12)
                  : context.appSecondaryText.withOpacity(0.08),
              shape: BoxShape.circle,
            ),
            child: Icon(
              isOpen ? Icons.timer_outlined : Icons.timer_off_outlined,
              color: isOpen ? AppTheme.primaryColor : context.appSecondaryText,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              isOpen
                  ? "Shift open since ${openedAt != null ? DateFormat('h:mm a').format(openedAt.toLocal()) : '—'}"
                  : "No active shift",
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 13,
                color: isOpen
                    ? AppTheme.primaryColor
                    : context.appSecondaryText,
              ),
            ),
          ),
          ElevatedButton(
            onPressed: isOpen
                ? () => context
                      .push("/shifts/close/${_currentShift!['id']}")
                      .then((_) => _loadCurrentShift())
                : _openShift,
            style: ElevatedButton.styleFrom(
              backgroundColor: isOpen
                  ? AppTheme.errorColor
                  : AppTheme.primaryColor,
              minimumSize: const Size(0, 38),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              elevation: 1,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(
              isOpen ? "Close Shift" : "Open Shift",
              style: const TextStyle(fontSize: 12),
            ),
          ),
        ],
      ),
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
      final list =
          (res.data["data"]["disabled_transaction_types"] as List?) ?? [];
      if (mounted)
        setState(() => _disabledTypes = list.map((e) => e.toString()).toSet());
    } catch (_) {
      // Leave _disabledTypes empty - fail open on the client, server
      // still enforces the kill-switch either way.
    }
  }

  // Renders a quick-action tile, automatically greying it out and
  // blocking navigation if an admin has disabled this provider+type
  // combo via the "disabled_transaction_types" config kill-switch.
  Widget _tile({
    required IconData icon,
    required String label,
    required Color bgColor,
    required Color iconColor,
    required String type,
    required VoidCallback onTap,
  }) {
    final disabled = _disabledTypes.contains("$_provider:$type");
    return _QuickAction(
      icon: icon,
      label: label,
      bgColor: context.appTileColor(disabled ? Colors.grey[200]! : bgColor),
      iconColor: disabled ? Colors.grey : iconColor,
      onTap: disabled
          ? () => ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text(
                  "This feature has been temporarily disabled by your administrator.",
                ),
              ),
            )
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
          final firstAvailable = map.entries
              .firstWhere(
                (e) => e.value != null,
                orElse: () => map.entries.first,
              )
              .key;
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
        : _simMap!.entries
              .where((e) => e.value != null)
              .map((e) => e.key)
              .toList();

    if (providers.isEmpty) {
      return [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              children: [
                Icon(
                  Icons.sim_card_alert_outlined,
                  color: Colors.grey[500],
                  size: 18,
                ),
                const SizedBox(width: 8),
                Text(
                  "Insert SIM",
                  style: TextStyle(
                    color: Colors.grey[600],
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ];
    }

    const labels = {
      "mtn": "MTN",
      "telecel": "Telecel",
      "at_money": "AirtelTigo",
    };
    const colors = {
      "mtn": Color(0xFFFFCC00),
      "telecel": Color(0xFFE31837),
      "at_money": Color(0xFF003087),
    };

    final widgets = <Widget>[];
    for (var i = 0; i < providers.length; i++) {
      final p = providers[i];
      widgets.add(
        Expanded(
          child: _ProviderTab(
            label: labels[p]!,
            value: p,
            selected: _provider == p,
            color: colors[p]!,
            onTap: (v) {
              setState(() => _provider = v);
              _load();
            },
          ),
        ),
      );
      if (i < providers.length - 1) widgets.add(const SizedBox(width: 4));
    }
    return widgets;
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get(
        "/transactions",
        queryParameters: {"limit": 5, "provider": _provider},
      );
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
    return Column(
      children: [
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
              gradient: LinearGradient(
                colors: [AppTheme.primaryColor, Color(0xFF004D43)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Image.asset(
                        "assets/images/agentpro-icon.png",
                        height: 26,
                      ),
                      const SizedBox(width: 8),
                      const Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: "Agent",
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            TextSpan(
                              text: "Pro",
                              style: TextStyle(
                                color: AppTheme.secondaryColor,
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  "${widget.user["first_name"] ?? ""} ${widget.user["last_name"] ?? ""}",
                  style: const TextStyle(
                    color: AppTheme.secondaryColor,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  widget.user["company_name"] ?? "",
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  (widget.user["role"] ?? "")
                      .toString()
                      .replaceAll("_", " ")
                      .toUpperCase(),
                  style: const TextStyle(
                    color: Colors.white60,
                    fontSize: 9.5,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.8,
                  ),
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: CustomScrollView(
              slivers: [
                const SliverToBoxAdapter(child: OfflineStatusBanner()),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: context.appSurface,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.06),
                            blurRadius: 3,
                          ),
                        ],
                      ),
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
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 7),
                  sliver: SliverToBoxAdapter(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          "Recent Transactions",
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        GestureDetector(
                          onTap: () => context.push("/transactions/history"),
                          child: const Text(
                            "See All",
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.primaryColor,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (_loading)
                  const SliverToBoxAdapter(child: RecentTransactionsSkeleton())
                else if (_recent.isEmpty)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(20),
                      child: Center(child: Text("No transactions yet")),
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, i) => _animateNewestTransaction(
                          isNewest: i == 0,
                          child: _RecentTxItem(
                            tx: _recent[i] as Map<String, dynamic>,
                          ),
                        ),
                        childCount: _recent.length,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
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
    if (_isPersonalSim) {
      return _personalQuickActionTiles(context);
    }

    final types = _quickActionTypes(personal: false);
    final tiles = <Widget>[];

    for (var index = 0; index < types.length; index++) {
      final type = types[index];
      final definition = _quickActionDefinition(type, personal: false);

      if (definition == null) continue;

      var label = definition.label;

      if (_provider == "telecel") {
        if (type == "cash_in") label = "Deposit";
        if (type == "cash_out") label = "Withdrawal";
        if (type == "data_bundle") label = "Internet Data";
        if (type == "balance_enquiry") label = "Balance";
      }

      final backgrounds = <Color>[
        const Color(0xFFE6F4F1),
        const Color(0xFFFDF3DC),
        const Color(0xFFE3EEFC),
        const Color(0xFFF0E6FA),
        const Color(0xFFFCE8E3),
        const Color(0xFFFFF7D6),
        const Color(0xFFE0F7F5),
        const Color(0xFFDFF3EE),
        const Color(0xFFFBE6EC),
      ];

      final iconColors = <Color>[
        AppTheme.primaryColor,
        const Color(0xFFB87E00),
        const Color(0xFF2E6FD9),
        const Color(0xFF8B5FBF),
        const Color(0xFFC1503D),
        const Color(0xFFA6821A),
        const Color(0xFF14847A),
        const Color(0xFF1F8A6F),
        const Color(0xFFB33F6B),
      ];

      tiles.add(
        _tile(
          icon: definition.icon,
          label: label,
          bgColor: backgrounds[index % backgrounds.length],
          iconColor: iconColors[index % iconColors.length],
          type: type,
          onTap: () =>
              context.push("/transactions?type=$type&provider=$_provider"),
        ),
      );
    }

    return tiles;
  }

  List<Widget> _personalQuickActionTiles(BuildContext context) {
    final sim = _simMap?[_provider];

    void go(String type) {
      final query = <String, String>{
        "type": type,
        "provider": _provider,
        if (sim != null) "sim_slot": sim.slot.toString(),
        if (sim != null) "sim_iccid": sim.iccid,
      };

      context.push(
        Uri(
          path: "/personal-transactions/new",
          queryParameters: query,
        ).toString(),
      );
    }

    final types = _quickActionTypes(personal: true);
    final tiles = <Widget>[];

    for (var index = 0; index < types.length; index++) {
      final type = types[index];
      final definition = _quickActionDefinition(type, personal: true);

      if (definition == null) continue;

      final backgrounds = <Color>[
        const Color(0xFFE6F4F1),
        const Color(0xFFE3EEFC),
        const Color(0xFFFDF3DC),
        const Color(0xFFFFF7D6),
        const Color(0xFFE0F7F5),
        const Color(0xFFF0E6FA),
        const Color(0xFFDFF3EE),
        const Color(0xFFFCE8E3),
        const Color(0xFFFBE6EC),
      ];

      final iconColors = <Color>[
        AppTheme.primaryColor,
        const Color(0xFF2E6FD9),
        const Color(0xFFB87E00),
        const Color(0xFFA6821A),
        const Color(0xFF14847A),
        const Color(0xFF8B5FBF),
        const Color(0xFF1F8A6F),
        const Color(0xFFC1503D),
        const Color(0xFFB33F6B),
      ];

      tiles.add(
        _tile(
          icon: definition.icon,
          label: definition.label,
          bgColor: backgrounds[index % backgrounds.length],
          iconColor: iconColors[index % iconColors.length],
          type: type,
          onTap: () => go(type),
        ),
      );
    }

    return tiles;
  }
}

class _ProviderTab extends StatelessWidget {
  final String label;
  final String value;
  final bool selected;
  final Color color;
  final void Function(String) onTap;

  const _ProviderTab({
    required this.label,
    required this.value,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => onTap(value),
      borderRadius: BorderRadius.circular(9),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? color : Colors.transparent,
          borderRadius: BorderRadius.circular(11),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: color.withOpacity(0.20),
                    blurRadius: 7,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            color: selected
                ? (color == const Color(0xFFFFCC00)
                      ? Colors.black
                      : Colors.white)
                : context.appSecondaryText,
          ),
        ),
      ),
    );
  }
}

class _QuickAction extends StatefulWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color bgColor;
  final Color iconColor;

  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.bgColor,
    required this.iconColor,
  });

  @override
  State<_QuickAction> createState() => _QuickActionState();
}

class _QuickActionState extends State<_QuickAction> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value || !mounted) return;
    setState(() => _pressed = value);
  }

  void _activate() {
    HapticFeedback.selectionClick();
    widget.onTap();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: widget.label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => _setPressed(true),
        onTapUp: (_) => _setPressed(false),
        onTapCancel: () => _setPressed(false),
        onTap: _activate,
        child: AnimatedScale(
          scale: _pressed ? 0.965 : 1,
          duration: const Duration(milliseconds: 110),
          curve: Curves.easeOutCubic,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 110),
            curve: Curves.easeOutCubic,
            decoration: BoxDecoration(
              color: context.appSurface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: _pressed
                    ? widget.iconColor.withOpacity(0.24)
                    : context.appSecondaryText.withOpacity(0.07),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(_pressed ? 0.025 : 0.055),
                  blurRadius: _pressed ? 4 : 9,
                  offset: Offset(0, _pressed ? 1 : 3),
                ),
              ],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AnimatedScale(
                  scale: _pressed ? 0.94 : 1,
                  duration: const Duration(milliseconds: 110),
                  curve: Curves.easeOutCubic,
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: widget.bgColor,
                      borderRadius: BorderRadius.circular(11),
                    ),
                    child: Icon(widget.icon, size: 23, color: widget.iconColor),
                  ),
                ),
                const SizedBox(height: 7),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    widget.label,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
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
    try {
      created = DateTime.parse(tx["created_at"].toString());
    } catch (e) {}
    final timeStr = created != null
        ? DateFormat("HH:mm").format(created.toLocal())
        : "";

    return GestureDetector(
      onTap: () => context.push('/transactions/${tx["id"]}'),
      child: Container(
        padding: const EdgeInsets.all(11),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: context.appSurface,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 3),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: isCashIn
                    ? context.appTileColor(const Color(0xFFE6F4F1))
                    : context.appTileColor(const Color(0xFFFDF3DC)),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Icon(
                isCashIn ? Icons.call_received : Icons.call_made,
                size: 16,
                color: isCashIn
                    ? AppTheme.primaryColor
                    : const Color(0xFFB87E00),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    transactionTypeLabel(
                      type,
                      (tx["provider"] ?? "").toString(),
                    ),
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    "${tx["customer_phone"] ?? ""} · $timeStr",
                    style: const TextStyle(
                      fontSize: 10.5,
                      color: Colors.grey,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            Text(
              "${isCashIn ? "+" : "-"}GH₵${amount.toStringAsFixed(2)}",
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.bold,
                color: isCashIn
                    ? AppTheme.primaryColor
                    : const Color(0xFFB33F3F),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
