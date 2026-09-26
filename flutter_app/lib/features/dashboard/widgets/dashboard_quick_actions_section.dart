import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../core/services/sim_card_service.dart';
import '../../../shared/models/sim_role.dart';
import '../../../shared/theme/app_colors.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/dashboard_empty_state.dart';
import '../../ussd_settings/quick_action_catalog.dart';
import '../../ussd_settings/quick_action_preference.dart';

class DashboardQuickActionsSection extends StatelessWidget {
  const DashboardQuickActionsSection({
    super.key,
    required this.provider,
    required this.simMap,
    required this.providerSims,
    required this.selectedSimSlot,
    required this.onSimSlotChanged,
    required this.disabledTypes,
    required this.simPurposes,
    required this.agentQuickActions,
    required this.subscriberQuickActions,
    required this.evdQuickActions,
    required this.merchantQuickActions,
    required this.agentCatalog,
    required this.subscriberCatalog,
    required this.simDetectionComplete,
    required this.simPurposesResolved,
    required this.agentCatalogResolved,
    required this.subscriberCatalogResolved,
    required this.onReloadQuickActions,
  });

  final String provider;
  final Map<String, SimCard?>? simMap;
  final Map<String, List<SimCard>> providerSims;
  final int? selectedSimSlot;
  final ValueChanged<int> onSimSlotChanged;

  final Set<String> disabledTypes;
  final Map<int, String> simPurposes;

  final Map<String, List<QuickActionPreference>> agentQuickActions;

  final Map<String, List<QuickActionPreference>> subscriberQuickActions;

  final Map<String, List<QuickActionPreference>> evdQuickActions;

  final Map<String, List<QuickActionPreference>> merchantQuickActions;

  final QuickActionCatalog? agentCatalog;
  final QuickActionCatalog? subscriberCatalog;

  final bool simDetectionComplete;
  final bool simPurposesResolved;
  final bool agentCatalogResolved;
  final bool subscriberCatalogResolved;

  final VoidCallback onReloadQuickActions;

  List<SimCard> _simsForProvider() {
    final sims = providerSims[provider];

    if (sims == null || sims.isEmpty) {
      final fallback = simMap?[provider];

      if (fallback == null) {
        return const <SimCard>[];
      }

      return <SimCard>[fallback];
    }

    return sims;
  }

  SimCard? _selectedSim(
    List<SimCard> sims,
  ) {
    if (sims.isEmpty) {
      return null;
    }

    for (final sim in sims) {
      if (sim.slot == selectedSimSlot) {
        return sim;
      }
    }

    return sims.first;
  }

  String _roleForSim(
    SimCard sim,
  ) {
    return canonicalSimPurpose(
      simPurposes[sim.slot],
    );
  }

  String _roleLabel(
    String role,
  ) {
    return switch (role) {
      'subscriber' => 'Subscriber',
      'evd' => 'EVD',
      'merchant' => 'Merchant',
      'agent' => 'Agent',
      _ => 'Role not set',
    };
  }

  String _customizeRoute(
    String role,
  ) {
    return switch (role) {
      'subscriber' => '/personal-quick-actions',
      'evd' => '/evd-quick-actions',
      'merchant' => '/merchant-quick-actions',
      _ => '/agent-quick-actions',
    };
  }

  Map<String, List<QuickActionPreference>> _profileForRole(
    String role,
  ) {
    return switch (role) {
      'subscriber' => subscriberQuickActions,
      'evd' => evdQuickActions,
      'merchant' => merchantQuickActions,
      _ => agentQuickActions,
    };
  }

  QuickActionCatalog? _catalogForRole(
    String role,
  ) {
    return switch (role) {
      'subscriber' => subscriberCatalog,
      'agent' => agentCatalog,
      _ => null,
    };
  }

  bool _catalogResolvedForRole(
    String role,
  ) {
    return switch (role) {
      'subscriber' => subscriberCatalogResolved,
      'agent' => agentCatalogResolved,
      _ => true,
    };
  }

  List<QuickActionPreference> _quickActions(
    String role,
  ) {
    final saved = _profileForRole(role)[provider];

    if (saved == null || saved.isEmpty) {
      final definitions = _catalogForRole(role)?.definitionsFor(provider) ??
          const <QuickActionCatalogDefinition>[];

      final fallback = definitions
          .take(9)
          .toList()
          .asMap()
          .entries
          .map(
            (entry) => QuickActionPreference(
              actionKey: entry.value.type,
              position: entry.key,
            ),
          )
          .toList();

      if (role == 'subscriber') {
        return normalizePersonalQuickActionPreferences(
          preferences: fallback,
        ).where((item) => item.isVisible).take(9).toList();
      }

      if (role == 'agent') {
        return fallback.where((item) => item.isVisible).take(9).toList();
      }

      // Merchant must never inherit Agent actions. Telecel Merchant,
      // however, has a small role-specific default set so a valid
      // Merchant SIM does not render an empty dashboard merely because
      // the user has not saved custom Merchant preferences yet.
      if (role == 'merchant' && provider == 'telecel') {
        // Telecel Merchant exposes its verified business workspaces.
        // Send Money is one grouped workspace for Telecel and Other Network.
        // Transfer E-Cash is one grouped workspace backed by the canonical
        // internal-transfer directions.
        // Data uses the verified Merchant data_bundle live-flow identity.
        const telecelMerchantDefaults = <String>[
          'airtime',
          'data_bundle',
          'balance_enquiry',
          'send_money',
          'float_to_working',
          'send_money_to_bank',
        ];

        return telecelMerchantDefaults
            .asMap()
            .entries
            .map(
              (entry) => QuickActionPreference(
                actionKey: entry.value,
                position: entry.key,
              ),
            )
            .toList();
      }

      // EVD and other Merchant/provider combinations deliberately have
      // no Agent fallback catalog.
      return const <QuickActionPreference>[];
    }

    final ordered = List<QuickActionPreference>.from(saved)
      ..sort(
        (a, b) => a.position.compareTo(b.position),
      );

    // Saved Merchant preferences remain authoritative. Telecel Merchant
    // outgoing accounting is validated, so no temporary presentation
    // filter is required here.
    final presentationOrdered = ordered;

    if (role == 'subscriber') {
      return normalizePersonalQuickActionPreferences(
        preferences: presentationOrdered,
      ).where((item) => item.isVisible).take(9).toList();
    }

    if (role == 'agent') {
      return normalizeBusinessQuickActionPreferences(
        provider: provider,
        preferences: presentationOrdered,
      ).where((item) => item.isVisible).take(9).toList();
    }

    return presentationOrdered
        .where((item) => item.isVisible)
        .take(9)
        .toList();
  }

  QuickActionCatalogDefinition? _definition(
    String type,
    String role,
  ) {
    return _catalogForRole(role)?.definitionFor(
      provider,
      type,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (simDetectionComplete == false) {
      return _loadingState();
    }

    final sims = _simsForProvider();
    final sim = _selectedSim(sims);

    if (sim == null) {
      return DashboardEmptyState(
        icon: Icons.sim_card_alert_rounded,
        title: 'No ${_providerLabel(provider)} SIM available',
        message: 'Insert or enable a ${_providerLabel(provider)} SIM '
            'to use Quick Actions.',
      );
    }

    if (simPurposesResolved == false) {
      return _loadingState();
    }

    final role = _roleForSim(sim);

    final roleSupported = const {
      'agent',
      'subscriber',
      'evd',
      'merchant',
    }.contains(role);

    if (roleSupported == false) {
      return _withSimSelector(
        sims: sims,
        selected: sim,
        child: const DashboardEmptyState(
          icon: Icons.sim_card_alert_rounded,
          title: 'SIM role required',
          message: 'AgentPro could not verify this SIM as '
              'Agent, Subscriber, EVD or Merchant. '
              'Open Settings > SIM Purpose and save '
              'the correct role for this SIM.',
        ),
      );
    }

    final profile = _profileForRole(role);
    final saved = profile[provider];
    final catalog = _catalogForRole(role);

    final catalogResolved = _catalogResolvedForRole(role);

    final hasVisibleSavedActions =
        saved?.any((item) => item.isVisible) ?? false;

    final roleUsesDedicatedCatalog = role == 'agent' || role == 'subscriber';

    if (roleUsesDedicatedCatalog &&
        catalogResolved == false &&
        catalog == null &&
        hasVisibleSavedActions == false) {
      return _loadingState();
    }

    if (roleUsesDedicatedCatalog &&
        catalogResolved &&
        catalog == null &&
        hasVisibleSavedActions == false) {
      return _withSimSelector(
        sims: sims,
        selected: sim,
        child: DashboardEmptyState(
          icon: Icons.cloud_off_rounded,
          title: '${_roleLabel(role)} Quick Actions unavailable',
          message: 'AgentPro could not load ${_roleLabel(role)} '
              'Quick Actions. Check your connection and try again.',
          actionLabel: 'Retry',
          actionIcon: Icons.refresh_rounded,
          onAction: onReloadQuickActions,
        ),
      );
    }

    final hasRoleSpecificDefaults =
        role == 'merchant' && provider == 'telecel';

    if ((role == 'evd' || role == 'merchant') &&
        hasVisibleSavedActions == false &&
        hasRoleSpecificDefaults == false) {
      return _withSimSelector(
        sims: sims,
        selected: sim,
        child: DashboardEmptyState(
          icon: Icons.grid_view_rounded,
          title: 'No ${_roleLabel(role)} Quick Actions configured',
          message: '${_roleLabel(role)} uses its own transaction '
              'menus. Agent Quick Actions are not reused for '
              'this SIM role.',
          actionLabel: 'Customize ${_roleLabel(role)} Quick Actions',
          actionIcon: Icons.tune_rounded,
          onAction: () => context.push(
            _customizeRoute(role),
          ),
        ),
      );
    }

    final actions = _roleTiles(
      context: context,
      role: role,
      sim: sim,
    );

    if (actions.isEmpty) {
      return _withSimSelector(
        sims: sims,
        selected: sim,
        child: DashboardEmptyState(
          icon: Icons.grid_view_rounded,
          title: 'No ${_roleLabel(role)} Quick Actions available',
          message: 'No transaction actions are currently available '
              'for ${_providerLabel(provider)} '
              '${_roleLabel(role)}.',
          actionLabel: 'Customize ${_roleLabel(role)} Quick Actions',
          actionIcon: Icons.tune_rounded,
          onAction: () => context.push(
            _customizeRoute(role),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (sims.length > 1) ...[
            _buildSimSelector(
              sims,
              sim,
            ),
            const SizedBox(height: 10),
          ],
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 6,
            crossAxisSpacing: 6,
            childAspectRatio: 0.9,
            children: actions,
          ),
        ],
      ),
    );
  }

  Widget _withSimSelector({
    required List<SimCard> sims,
    required SimCard selected,
    required Widget child,
  }) {
    if (sims.length < 2) {
      return child;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            16,
            10,
            16,
            0,
          ),
          child: _buildSimSelector(
            sims,
            selected,
          ),
        ),
        child,
      ],
    );
  }

  Widget _buildSimSelector(
    List<SimCard> sims,
    SimCard selected,
  ) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final sim in sims) ...[
            ChoiceChip(
              label: Text(
                '${_roleLabel(_roleForSim(sim))} '
                '· SIM ${sim.slot + 1}',
              ),
              selected: sim.slot == selected.slot,
              onSelected: (value) {
                if (value) {
                  onSimSlotChanged(sim.slot);
                }
              },
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }

  Widget _loadingState() {
    return const Padding(
      padding: EdgeInsets.fromLTRB(16, 28, 16, 28),
      child: Center(
        child: SizedBox(
          width: 26,
          height: 26,
          child: CircularProgressIndicator(
            strokeWidth: 2.4,
          ),
        ),
      ),
    );
  }

  List<Widget> _roleTiles({
    required BuildContext context,
    required String role,
    required SimCard sim,
  }) {
    final actions = _quickActions(role);
    final tiles = <Widget>[];

    const backgrounds = <Color>[
      Color(0xFFE6F4F1),
      Color(0xFFFDF3DC),
      Color(0xFFE3EEFC),
      Color(0xFFF0E6FA),
      Color(0xFFFCE8E3),
      Color(0xFFFFF7D6),
      Color(0xFFE0F7F5),
      Color(0xFFDFF3EE),
      Color(0xFFFBE6EC),
    ];

    const iconColors = <Color>[
      AppTheme.primaryColor,
      Color(0xFFB87E00),
      Color(0xFF2E6FD9),
      Color(0xFF8B5FBF),
      Color(0xFFC1503D),
      Color(0xFFA6821A),
      Color(0xFF14847A),
      Color(0xFF1F8A6F),
      Color(0xFFB33F6B),
    ];

    var telecelMerchantECashAdded = false;

    for (var index = 0; index < actions.length; index++) {
      final preference = actions[index];
      final type = preference.actionKey;

      // MTN Agent may deliberately select both the combined Cash In/Out
      // workspace and the individual Cash Out action. Quick Action
      // customization is authoritative, so do not suppress either tile.
      final isMtnAgentCashWorkspace =
          provider == 'mtn' && role == 'agent' && type == 'send_money';

      final isTelecelMerchantSendMoney =
          provider == 'telecel' && role == 'merchant' && type == 'send_money';
      final isTelecelMerchantECash =
          provider == 'telecel' &&
          role == 'merchant' &&
          (type == 'float_to_working' || type == 'working_to_float');
      final isTelecelMerchantBankTransfer =
          provider == 'telecel' &&
          role == 'merchant' &&
          type == 'send_money_to_bank';

      // Both canonical E-Cash directions represent one dashboard workspace.
      // Saved customization remains untouched; only presentation is deduped.
      if (isTelecelMerchantECash) {
        if (telecelMerchantECashAdded) {
          continue;
        }
        telecelMerchantECashAdded = true;
      }

      final definition = _definition(
        type,
        role,
      );

      final defaultLabel = quickActionDisplayLabel(
        provider: provider,
        type: type,
        catalogLabel: definition?.displayLabel,
      );

      final label = isMtnAgentCashWorkspace
          ? 'Cash In/Out'
          : isTelecelMerchantSendMoney
              ? 'Send Money'
              : isTelecelMerchantECash
                  ? 'Transfer E-Cash'
                  : isTelecelMerchantBankTransfer
                      ? 'Bank Transfer'
                      : preference.resolvedDisplayLabel(
              defaultLabel,
            );

      final icon = quickActionIconFromKey(
            preference.iconKey,
          ) ??
          definition?.icon ??
          quickActionCatalogIcon(type);

      final bundleCategory = (preference.bundleCategory ?? '').trim();

      final recipientMode = (preference.recipientMode ?? '').trim();

      tiles.add(
        _buildTile(
          context: context,
          icon: icon,
          label: label,
          bgColor: preference.resolvedIconBackgroundColor(
            backgrounds[index % backgrounds.length],
          ),
          iconColor: preference.resolvedIconColor(
            iconColors[index % iconColors.length],
          ),
          type: type,
          onTap: () {
            final query = <String, String>{
              'type': type,
              'provider': provider,
              if (bundleCategory.isNotEmpty) 'bundle_category': bundleCategory,
              if (recipientMode.isNotEmpty) 'recipient_mode': recipientMode,
              'sim_slot': sim.slot.toString(),
              if (sim.iccid.isNotEmpty) 'sim_iccid': sim.iccid,
              'sim_subscription_id': sim.subscriptionId.toString(),
            };

            final path = role == 'subscriber'
                ? '/personal-transactions/new'
                : isMtnAgentCashWorkspace
                    ? '/transactions/mtn-cash-in-out'
                    : isTelecelMerchantECash
                        ? '/transactions/telecel-merchant-ecash'
                        : '/transactions';

            context.push(
              Uri(
                path: path,
                queryParameters: query,
              ).toString(),
            );
          },
        ),
      );
    }

    return tiles;
  }

  Widget _buildTile({
    required BuildContext context,
    required IconData icon,
    required String label,
    required Color bgColor,
    required Color iconColor,
    required String type,
    required VoidCallback onTap,
  }) {
    final disabled = disabledTypes.contains(
      '$provider:$type',
    );

    return _QuickAction(
      icon: icon,
      label: label,
      bgColor: disabled
          ? context.appSecondaryText.withValues(
              alpha: context.isDarkMode ? 0.12 : 0.10,
            )
          : context.appTileColor(bgColor),
      iconColor: disabled
          ? context.appSecondaryText.withValues(alpha: 0.75)
          : iconColor,
      onTap: disabled
          ? () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                    'This feature has been '
                    'temporarily disabled by '
                    'your administrator.',
                  ),
                ),
              );
            }
          : onTap,
    );
  }

  String _providerLabel(
    String value,
  ) {
    return quickActionProviderLabel(value);
  }
}

class _QuickAction extends StatefulWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.bgColor,
    required this.iconColor,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color bgColor;
  final Color iconColor;

  @override
  State<_QuickAction> createState() => _QuickActionState();
}

class _QuickActionState extends State<_QuickAction> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value || !mounted) {
      return;
    }

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
                    ? widget.iconColor.withValues(alpha: 0.24)
                    : context.appSecondaryText.withValues(alpha: 0.07),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(
                    alpha: _pressed ? 0.025 : 0.055,
                  ),
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
                    child: Icon(
                      widget.icon,
                      size: 23,
                      color: widget.iconColor,
                    ),
                  ),
                ),
                const SizedBox(height: 7),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    widget.label.toUpperCase(),
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
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
