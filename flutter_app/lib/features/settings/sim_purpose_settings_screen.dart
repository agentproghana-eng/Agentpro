// sim_purpose_settings_screen.dart

import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/sim_role_assignment_service.dart';
import '../../core/services/storage_service.dart';
import '../../shared/models/sim_role.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class SimPurposeSettingsScreen extends StatefulWidget {
  const SimPurposeSettingsScreen({
    super.key,
  });

  @override
  State<SimPurposeSettingsScreen> createState() =>
      _SimPurposeSettingsScreenState();
}

class _SimPurposeSettingsScreenState extends State<SimPurposeSettingsScreen> {
  List<SimCard> _simCards = const [];

  final Map<int, SimRole> _roles = {};

  bool _loading = true;
  bool _saving = false;

  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  SimRole _roleFromSavedPurpose(dynamic value) {
    switch (value?.toString().trim().toLowerCase()) {
      case 'subscriber':
      case 'personal':
        return SimRole.subscriber;

      case 'evd':
        return SimRole.evd;

      case 'merchant':
        return SimRole.merchant;

      case 'agent':
      default:
        return SimRole.agent;
    }
  }

  String _roleValue(SimRole role) {
    return switch (role) {
      SimRole.agent => 'agent',
      SimRole.subscriber => 'subscriber',
      SimRole.evd => 'evd',
      SimRole.merchant => 'merchant',
    };
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final cards = await SimCardService.getSimCards();

      final response = await ApiClient.instance.get('/user-sim-purposes');

      final rawData = response.data['data'];

      final saved = rawData is List ? rawData : const [];

      final roles = <int, SimRole>{};

      for (final item in saved) {
        if (item is! Map) {
          continue;
        }

        final rawSlot = item['sim_slot'];

        final slot =
            rawSlot is int ? rawSlot : int.tryParse(rawSlot?.toString() ?? '');

        if (slot == null) {
          continue;
        }

        final role = _roleFromSavedPurpose(item['purpose']);

        roles[slot] = role;
      }

      for (final card in cards) {
        roles.putIfAbsent(
          card.slot,
          () => SimRole.agent,
        );

        final supported = supportedSimRolesForProvider(card.network);

        if (!supported.contains(roles[card.slot])) {
          roles[card.slot] = SimRole.agent;
        }
      }

      if (!mounted) return;

      setState(() {
        _simCards = cards;
        _roles
          ..clear()
          ..addAll(roles);
        _loading = false;
      });
    } on SimPermissionException {
      if (!mounted) return;

      setState(() {
        _error = 'Phone permission is required to identify your SIM cards.';
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _error = 'Failed to load SIM information.';
        _loading = false;
      });
    }
  }

  Future<void> _save() async {
    if (_simCards.isEmpty || _saving) {
      return;
    }

    setState(() => _saving = true);

    try {
      final installationId =
          await StorageService.getOrCreateInstallationId();

      final assignments = _simCards.map((card) {
        final role = _roles[card.slot] ?? SimRole.agent;

        return {
          'sim_slot': card.slot,
          'sim_iccid': card.iccid.isNotEmpty ? card.iccid : null,
          'installation_id': installationId,
          'sim_subscription_id': card.subscriptionId,
          'provider': card.network == 'unknown' ? null : card.network,
          'purpose': _roleValue(role),
        };
      }).toList();

      await ApiClient.instance.put(
        '/user-sim-purposes',
        data: {
          'assignments': assignments,
        },
      );

      // Persist the server-accepted role locally so offline Business
      // execution does not lose an EVD/Merchant assignment and silently
      // fall back to Agent.
      for (final card in _simCards) {
        final role = _roles[card.slot] ?? SimRole.agent;

        await SimRoleAssignmentService.cacheRoleForSlot(
          slot: card.slot,
          role: _roleValue(role),
          simIccid: card.iccid,
          simSubscriptionId: card.subscriptionId,
          provider: card.network,
        );
      }

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('SIM roles saved'),
        ),
      );
    } catch (_) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'AgentPro could not save the SIM roles.',
          ),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  String _networkLabel(String network) {
    switch (network) {
      case 'mtn':
        return 'MTN';

      case 'telecel':
        return 'Telecel';

      case 'at_money':
        return 'AT Money';

      default:
        return 'Unknown network';
    }
  }

  String _roleDescription(SimRole role) {
    return switch (role) {
      SimRole.agent => 'Mobile Money Agent transactions',
      SimRole.subscriber => 'Your normal subscriber transactions',
      SimRole.evd => 'Electronic voucher distribution',
      SimRole.merchant => 'Merchant collections and payments',
    };
  }

  IconData _roleIcon(SimRole role) {
    return switch (role) {
      SimRole.agent => Icons.storefront_outlined,
      SimRole.subscriber => Icons.person_outline_rounded,
      SimRole.evd => Icons.confirmation_number_outlined,
      SimRole.merchant => Icons.point_of_sale_outlined,
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('SIM Purpose'),
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(),
            )
          : _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.sim_card_alert_outlined,
                size: 44,
                color: AppTheme.errorColor,
              ),
              const SizedBox(height: 12),
              Text(
                _error!,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                label: const Text('Try Again'),
              ),
            ],
          ),
        ),
      );
    }

    if (_simCards.isEmpty) {
      return const EmptyState(
        icon: Icons.sim_card_alert,
        title: 'No SIM cards detected',
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
      children: [
        Text(
          'Choose how each SIM is used',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 6),
        Text(
          'AgentPro uses this to select the correct SIM '
          'before starting a transaction.',
          style: TextStyle(
            color: context.appSecondaryText,
            height: 1.4,
          ),
        ),
        const SizedBox(height: 18),
        _buildSafetyNotice(context),
        const SizedBox(height: 18),
        for (final card in _simCards) ...[
          _buildSimCard(context, card),
          const SizedBox(height: 14),
        ],
        const SizedBox(height: 6),
        AppButton(
          label: 'Save SIM Roles',
          onPressed: _save,
          isLoading: _saving,
        ),
      ],
    );
  }

  Widget _buildSafetyNotice(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.appTileColor(
          const Color(0xFFEAF5F2),
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppTheme.primaryColor.withValues(alpha: 0.15),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: AppTheme.primaryColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(11),
            ),
            child: const Icon(
              Icons.shield_outlined,
              color: AppTheme.primaryColor,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'Correct SIM roles help AgentPro prevent '
              'Agent, Subscriber, Merchant or EVD '
              'transactions from being sent through '
              'the wrong SIM.',
              style: TextStyle(
                height: 1.4,
                fontSize: 12.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSimCard(
    BuildContext context,
    SimCard card,
  ) {
    final role = _roles[card.slot] ?? SimRole.agent;

    final availableRoles = supportedSimRolesForProvider(card.network);

    return Container(
      decoration: BoxDecoration(
        color: context.appSurface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: context.appSecondaryText.withValues(alpha: 0.10),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppTheme.providerColor(
                      card.network,
                    ).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    Icons.sim_card_outlined,
                    color: AppTheme.providerColor(
                      card.network,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'SIM ${card.slot + 1}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        _networkLabel(card.network),
                        style: TextStyle(
                          color: context.appSecondaryText,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    simRoleLabel(role),
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 11,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Divider(
            height: 1,
            color: context.appSecondaryText.withValues(alpha: 0.10),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'SIM ROLE',
                  style: TextStyle(
                    color: context.appSecondaryText,
                    fontWeight: FontWeight.w700,
                    fontSize: 10.5,
                    letterSpacing: 0.9,
                  ),
                ),
                const SizedBox(height: 10),
                for (final option in availableRoles) ...[
                  _SimRoleOption(
                    icon: _roleIcon(option),
                    title: simRoleLabel(option),
                    subtitle: _roleDescription(option),
                    selected: option == role,
                    onTap: () {
                      setState(() {
                        _roles[card.slot] = option;
                      });
                    },
                  ),
                  if (option != availableRoles.last)
                    const SizedBox(
                      height: 8,
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SimRoleOption extends StatelessWidget {
  final IconData icon;

  final String title;
  final String subtitle;

  final bool selected;

  final VoidCallback onTap;

  const _SimRoleOption({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.primaryColor.withValues(alpha: 0.08)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected
                ? AppTheme.primaryColor
                : context.appSecondaryText.withValues(alpha: 0.10),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: selected
                    ? AppTheme.primaryColor.withValues(
                        alpha: 0.13,
                      )
                    : context.appTileColor(
                        const Color(
                          0xFFF1F5F4,
                        ),
                      ),
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(
                icon,
                size: 20,
                color:
                    selected ? AppTheme.primaryColor : context.appSecondaryText,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: selected ? AppTheme.primaryColor : null,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: context.appSecondaryText,
                      fontSize: 11.5,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color:
                  selected ? AppTheme.primaryColor : context.appSecondaryText,
              size: 22,
            ),
          ],
        ),
      ),
    );
  }
}
