import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../core/services/sim_card_service.dart';
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
    required this.disabledTypes,
    required this.simPurposes,
    required this.agentQuickActions,
    required this.personalQuickActions,
    required this.agentCatalog,
    required this.personalCatalog,
  });

  final String provider;
  final Map<String, SimCard?>? simMap;
  final Set<String> disabledTypes;
  final Map<int, String> simPurposes;
  final Map<String, List<QuickActionPreference>> agentQuickActions;
  final Map<String, List<QuickActionPreference>> personalQuickActions;
  final QuickActionCatalog? agentCatalog;
  final QuickActionCatalog? personalCatalog;

  bool get _isPersonalSim {
    final sim = simMap?[provider];

    if (sim == null) {
      return false;
    }

    return simPurposes[sim.slot] == 'personal';
  }

  QuickActionCatalog? _catalog({
    required bool personal,
  }) {
    return personal ? personalCatalog : agentCatalog;
  }

  List<QuickActionPreference> _quickActions({
    required bool personal,
  }) {
    final saved =
        personal ? personalQuickActions[provider] : agentQuickActions[provider];

    if (saved != null) {
      final supported = personal
          ? kPersonalQuickActionSupport[provider] ?? const <String>{}
          : kAgentQuickActionSupport[provider] ?? const <String>{};

      return saved
          .where(
            (item) => item.isVisible && supported.contains(item.actionKey),
          )
          .take(9)
          .toList();
    }

    final definitions =
        _catalog(personal: personal)?.definitionsFor(provider) ??
            const <QuickActionCatalogDefinition>[];

    return definitions
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
  }

  QuickActionCatalogDefinition? _definition(
    String type, {
    required bool personal,
  }) {
    return _catalog(
      personal: personal,
    )?.definitionFor(provider, type);
  }

  @override
  Widget build(BuildContext context) {
    final actions =
        _isPersonalSim ? _personalTiles(context) : _agentTiles(context);

    if (actions.isEmpty) {
      return DashboardEmptyState(
        icon: Icons.grid_view_rounded,
        title: 'No quick actions available',
        message: 'No transaction actions are currently available for '
            '${_providerLabel(provider)}. '
            'You can choose different actions in Templates.',
        actionLabel: 'Customize Quick Actions',
        actionIcon: Icons.tune_rounded,
        onAction: () => context.push('/agent-quick-actions'),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
      child: GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
        childAspectRatio: 0.9,
        children: actions,
      ),
    );
  }

  List<Widget> _agentTiles(BuildContext context) {
    final actions = _quickActions(personal: false);
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

    for (var index = 0; index < actions.length; index++) {
      final preference = actions[index];
      final type = preference.actionKey;
      final definition = _definition(type, personal: false);

      final defaultLabel =
          definition?.displayLabel ?? quickActionTransactionLabel(type);

      final label = preference.resolvedLabel(defaultLabel);
      final icon = quickActionIconFromKey(preference.iconKey) ??
          definition?.icon ??
          quickActionCatalogIcon(type);

      tiles.add(
        _buildTile(
          context: context,
          icon: icon,
          label: label,
          bgColor: backgrounds[index % backgrounds.length],
          iconColor: preference.resolvedIconColor(
            iconColors[index % iconColors.length],
          ),
          type: type,
          onTap: () => context.push(
            '/transactions?type=$type&provider=$provider',
          ),
        ),
      );
    }

    return tiles;
  }

  List<Widget> _personalTiles(BuildContext context) {
    final sim = simMap?[provider];
    final actions = _quickActions(personal: true);
    final tiles = <Widget>[];

    const backgrounds = <Color>[
      Color(0xFFE6F4F1),
      Color(0xFFE3EEFC),
      Color(0xFFFDF3DC),
      Color(0xFFFFF7D6),
      Color(0xFFE0F7F5),
      Color(0xFFF0E6FA),
      Color(0xFFDFF3EE),
      Color(0xFFFCE8E3),
      Color(0xFFFBE6EC),
    ];

    const iconColors = <Color>[
      AppTheme.primaryColor,
      Color(0xFF2E6FD9),
      Color(0xFFB87E00),
      Color(0xFFA6821A),
      Color(0xFF14847A),
      Color(0xFF8B5FBF),
      Color(0xFF1F8A6F),
      Color(0xFFC1503D),
      Color(0xFFB33F6B),
    ];

    for (var index = 0; index < actions.length; index++) {
      final preference = actions[index];
      final type = preference.actionKey;
      final definition = _definition(type, personal: true);

      final icon = quickActionIconFromKey(preference.iconKey) ??
          definition?.icon ??
          quickActionCatalogIcon(type);

      final label = preference.resolvedLabel(
        definition?.displayLabel ?? quickActionTransactionLabel(type),
      );

      tiles.add(
        _buildTile(
          context: context,
          icon: icon,
          label: label,
          bgColor: backgrounds[index % backgrounds.length],
          iconColor: preference.resolvedIconColor(
            iconColors[index % iconColors.length],
          ),
          type: type,
          onTap: () {
            final query = <String, String>{
              'type': type,
              'provider': provider,
              if (sim != null) 'sim_slot': sim.slot.toString(),
              if (sim != null && sim.iccid.isNotEmpty) 'sim_iccid': sim.iccid,
            };

            context.push(
              Uri(
                path: '/personal-transactions/new',
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
    final disabled = disabledTypes.contains('$provider:$type');

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
                    'This feature has been temporarily disabled '
                    'by your administrator.',
                  ),
                ),
              );
            }
          : onTap,
    );
  }

  String _providerLabel(String value) {
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
