import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';

class QuickActionDefinition {
  final String type;
  final String label;
  final IconData icon;

  const QuickActionDefinition({
    required this.type,
    required this.label,
    required this.icon,
  });
}

const List<QuickActionDefinition> kAgentQuickActionDefinitions = [
  QuickActionDefinition(
    type: 'cash_in',
    label: 'Cash In / Deposit',
    icon: Icons.call_received,
  ),
  QuickActionDefinition(
    type: 'cash_out',
    label: 'Cash Out / Withdrawal',
    icon: Icons.call_made,
  ),
  QuickActionDefinition(
    type: 'send_money',
    label: 'Send Money',
    icon: Icons.send_outlined,
  ),
  QuickActionDefinition(
    type: 'merchant_payment',
    label: 'Pay to Merchant',
    icon: Icons.storefront_outlined,
  ),
  QuickActionDefinition(
    type: 'bill_payment',
    label: 'Pay to Agent',
    icon: Icons.receipt_long_outlined,
  ),
  QuickActionDefinition(
    type: 'airtime',
    label: 'Airtime',
    icon: Icons.phone_android_outlined,
  ),
  QuickActionDefinition(
    type: 'data_bundle',
    label: 'Data Bundle',
    icon: Icons.wifi_outlined,
  ),
  QuickActionDefinition(
    type: 'balance_enquiry',
    label: 'Check Balance',
    icon: Icons.account_balance_wallet_outlined,
  ),
  QuickActionDefinition(
    type: 'commission_balance',
    label: 'Commission Balance',
    icon: Icons.pie_chart_outline,
  ),
  QuickActionDefinition(
    type: 'cash_in_commission',
    label: 'Cash In Commission',
    icon: Icons.savings_outlined,
  ),
  QuickActionDefinition(
    type: 'commission_transfer',
    label: 'Commission to Float',
    icon: Icons.swap_vert_circle_outlined,
  ),
  QuickActionDefinition(
    type: 'working_to_float',
    label: 'M-PESA to Float',
    icon: Icons.move_to_inbox_outlined,
  ),
  QuickActionDefinition(
    type: 'float_to_working',
    label: 'Float to M-PESA',
    icon: Icons.outbox_outlined,
  ),
  QuickActionDefinition(
    type: 'business_deposit',
    label: 'Business Deposit',
    icon: Icons.business_outlined,
  ),
  QuickActionDefinition(
    type: 'business_withdrawal',
    label: 'Business Withdrawal',
    icon: Icons.account_balance_outlined,
  ),
];

const List<QuickActionDefinition> kPersonalQuickActionDefinitions = [
  QuickActionDefinition(
    type: 'send_money_same_network',
    label: 'Send Money\nSame Network',
    icon: Icons.send_outlined,
  ),
  QuickActionDefinition(
    type: 'send_money_cross_network',
    label: 'Send Money\nOther Network',
    icon: Icons.compare_arrows,
  ),
  QuickActionDefinition(
    type: 'withdraw_cash',
    label: 'Withdraw Cash',
    icon: Icons.call_made,
  ),
  QuickActionDefinition(
    type: 'buy_airtime',
    label: 'Buy Airtime',
    icon: Icons.phone_android_outlined,
  ),
  QuickActionDefinition(
    type: 'buy_data',
    label: 'Buy Data',
    icon: Icons.wifi_outlined,
  ),
  QuickActionDefinition(
    type: 'buy_mashup',
    label: 'Mash Up',
    icon: Icons.card_giftcard_outlined,
  ),
  QuickActionDefinition(
    type: 'check_momo_balance',
    label: 'Check MoMo\nBalance',
    icon: Icons.account_balance_wallet_outlined,
  ),
  QuickActionDefinition(
    type: 'check_airtime_balance',
    label: 'Check Airtime\nBalance',
    icon: Icons.sim_card_outlined,
  ),
];

const Map<String, Set<String>> kAgentQuickActionSupport = {
  'mtn': {
    'cash_in',
    'cash_out',
    'send_money',
    'merchant_payment',
    'bill_payment',
    'airtime',
    'data_bundle',
    'balance_enquiry',
    'commission_balance',
    'cash_in_commission',
    'commission_transfer',
  },
  'telecel': {
    'cash_in',
    'cash_out',
    'business_deposit',
    'business_withdrawal',
    'airtime',
    'data_bundle',
    'balance_enquiry',
    'working_to_float',
    'float_to_working',
    'commission_transfer',
  },
  'at_money': {
    'cash_in',
    'cash_out',
    'send_money',
    'merchant_payment',
    'bill_payment',
    'airtime',
    'data_bundle',
    'balance_enquiry',
  },
};

const Map<String, Set<String>> kPersonalQuickActionSupport = {
  'mtn': {
    'send_money_same_network',
    'send_money_cross_network',
    'withdraw_cash',
    'buy_airtime',
    'buy_data',
    'buy_mashup',
    'check_momo_balance',
    'check_airtime_balance',
  },
  'telecel': {
    'send_money_same_network',
    'send_money_cross_network',
    'withdraw_cash',
    'buy_airtime',
    'buy_data',
    'buy_mashup',
    'check_momo_balance',
    'check_airtime_balance',
  },
  'at_money': {
    'send_money_same_network',
    'send_money_cross_network',
    'withdraw_cash',
    'buy_airtime',
    'buy_data',
    'buy_mashup',
    'check_momo_balance',
    'check_airtime_balance',
  },
};

const Map<String, List<String>> kAgentQuickActionDefaults = {
  'mtn': [
    'cash_in',
    'cash_out',
    'send_money',
    'merchant_payment',
    'bill_payment',
    'airtime',
    'data_bundle',
    'balance_enquiry',
    'commission_balance',
  ],
  'telecel': [
    'cash_in',
    'cash_out',
    'business_deposit',
    'airtime',
    'data_bundle',
    'balance_enquiry',
    'working_to_float',
    'float_to_working',
    'commission_transfer',
  ],
  'at_money': [
    'cash_in',
    'cash_out',
    'send_money',
    'merchant_payment',
    'bill_payment',
    'airtime',
    'data_bundle',
    'balance_enquiry',
  ],
};

const Map<String, List<String>> kPersonalQuickActionDefaults = {
  'mtn': [
    'send_money_same_network',
    'send_money_cross_network',
    'withdraw_cash',
    'buy_airtime',
    'buy_data',
    'buy_mashup',
    'check_momo_balance',
    'check_airtime_balance',
  ],
  'telecel': [
    'send_money_same_network',
    'send_money_cross_network',
    'withdraw_cash',
    'buy_airtime',
    'buy_data',
    'buy_mashup',
    'check_momo_balance',
    'check_airtime_balance',
  ],
  'at_money': [
    'send_money_same_network',
    'send_money_cross_network',
    'withdraw_cash',
    'buy_airtime',
    'buy_data',
    'buy_mashup',
    'check_momo_balance',
    'check_airtime_balance',
  ],
};

class QuickActionCustomizationScreen extends StatefulWidget {
  final bool isPersonal;

  const QuickActionCustomizationScreen({
    super.key,
    required this.isPersonal,
  });

  @override
  State<QuickActionCustomizationScreen> createState() =>
      _QuickActionCustomizationScreenState();
}

class _QuickActionCustomizationScreenState
    extends State<QuickActionCustomizationScreen> {
  String _provider = 'mtn';
  bool _loading = true;
  bool _saving = false;
  String? _error;

  Map<String, List<String>> _preferences = {
    'mtn': <String>[],
    'telecel': <String>[],
    'at_money': <String>[],
  };

  List<QuickActionDefinition> get _definitions =>
      widget.isPersonal
          ? kPersonalQuickActionDefinitions
          : kAgentQuickActionDefinitions;

  Map<String, List<String>> get _defaults =>
      widget.isPersonal
          ? kPersonalQuickActionDefaults
          : kAgentQuickActionDefaults;

  Map<String, Set<String>> get _support =>
      widget.isPersonal
          ? kPersonalQuickActionSupport
          : kAgentQuickActionSupport;

  Set<String> get _supportedTypes =>
      _support[_provider] ?? const <String>{};

  List<QuickActionDefinition> get _availableDefinitions =>
      _definitions
          .where((definition) => _supportedTypes.contains(definition.type))
          .toList();

  List<String> get _selected => _preferences[_provider] ?? <String>[];

  @override
  void initState() {
    super.initState();
    _load();
  }

  QuickActionDefinition? _definitionFor(String type) {
    for (final definition in _definitions) {
      if (definition.type == type) return definition;
    }
    return null;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await ApiClient.instance.get('/users/me/quick-actions');
      final data = response.data['data'] as Map<String, dynamic>? ?? {};
      final modeKey = widget.isPersonal ? 'personal' : 'agent';
      final saved =
          data[modeKey] as Map<String, dynamic>? ?? <String, dynamic>{};

      final parsed = <String, List<String>>{};

      for (final provider in ['mtn', 'telecel', 'at_money']) {
        final providerValue = saved[provider];

        if (providerValue is List) {
          final supported =
              _support[provider] ?? const <String>{};

          parsed[provider] = providerValue
              .whereType<String>()
              .where(
                (type) =>
                    _definitionFor(type) != null &&
                    supported.contains(type),
              )
              .take(9)
              .toList();
        } else {
          parsed[provider] =
              List<String>.from(_defaults[provider] ?? const []);
        }
      }

      if (!mounted) return;

      setState(() {
        _preferences = parsed;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _preferences = {
          for (final provider in ['mtn', 'telecel', 'at_money'])
            provider: List<String>.from(
              _defaults[provider] ?? const [],
            ),
        };
        _loading = false;
        _error = 'Could not load saved layout. Showing defaults.';
      });
    }
  }

  void _toggle(String type) {
    final selected = List<String>.from(_selected);

    setState(() {
      if (selected.contains(type)) {
        selected.remove(type);
      } else {
        if (selected.length >= 9) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('A 3×3 grid can contain at most 9 actions.'),
            ),
          );
          return;
        }

        selected.add(type);
      }

      _preferences[_provider] = selected;
    });
  }

  void _restoreDefaults() {
    setState(() {
      _preferences[_provider] = List<String>.from(
        _defaults[_provider] ?? const [],
      );
    });
  }

  Future<void> _restoreAllDefaults() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Restore all providers?'),
        content: Text(
          'This will restore the default ${widget.isPersonal ? 'Personal' : 'Agent'} '
          'Quick Actions for MTN, Telecel, and AT Money.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Restore All'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() {
      _preferences = {
        for (final provider in ['mtn', 'telecel', 'at_money'])
          provider: List<String>.from(
            _defaults[provider] ?? const [],
          ),
      };
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);

    try {
      final field = widget.isPersonal
          ? 'personal_quick_actions'
          : 'agent_quick_actions';

      await ApiClient.instance.patch(
        '/users/me/quick-actions',
        data: {
          field: _preferences,
        },
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${widget.isPersonal ? 'Personal' : 'Agent'} Quick Actions saved',
          ),
        ),
      );
    } catch (_) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to save Quick Actions'),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final modeLabel = widget.isPersonal ? 'Personal' : 'Agent';

    return Scaffold(
      appBar: AppBar(
        title: Text('$modeLabel Quick Actions'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  'Customize $modeLabel Dashboard',
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  'Choose and arrange up to 9 actions for each provider. '
                  '$modeLabel preferences are stored separately.',
                  style: TextStyle(
                    fontSize: 11,
                    color: context.appSecondaryText,
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    _error!,
                    style: const TextStyle(
                      color: Colors.orange,
                      fontSize: 11,
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                Row(
                  children: [
                    _ProviderButton(
                      label: 'MTN',
                      value: 'mtn',
                      selected: _provider == 'mtn',
                      onTap: _selectProvider,
                    ),
                    const SizedBox(width: 7),
                    _ProviderButton(
                      label: 'Telecel',
                      value: 'telecel',
                      selected: _provider == 'telecel',
                      onTap: _selectProvider,
                    ),
                    const SizedBox(width: 7),
                    _ProviderButton(
                      label: 'AT Money',
                      value: 'at_money',
                      selected: _provider == 'at_money',
                      onTap: _selectProvider,
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Text(
                  '3×3 Preview (${_selected.length}/9)',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    TextButton.icon(
                      onPressed: _restoreDefaults,
                      icon: const Icon(Icons.restore, size: 17),
                      label: const Text('Restore This Provider'),
                    ),
                    TextButton.icon(
                      onPressed: _restoreAllDefaults,
                      icon: const Icon(Icons.restart_alt, size: 17),
                      label: const Text('Restore All'),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                _QuickActionPreview(
                  selected: _selected,
                  definitions: _definitions,
                ),
                const SizedBox(height: 20),
                const Text(
                  'Selected Actions — drag to reorder',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 8),
                if (_selected.isEmpty)
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: context.appSurface,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Text(
                      'No actions selected.',
                      textAlign: TextAlign.center,
                    ),
                  )
                else
                  ReorderableListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _selected.length,
                    onReorder: (oldIndex, newIndex) {
                      setState(() {
                        final items = List<String>.from(_selected);

                        if (newIndex > oldIndex) newIndex--;

                        final item = items.removeAt(oldIndex);
                        items.insert(newIndex, item);
                        _preferences[_provider] = items;
                      });
                    },
                    itemBuilder: (context, index) {
                      final type = _selected[index];
                      final definition = _definitionFor(type)!;

                      return Card(
                        key: ValueKey(type),
                        child: ListTile(
                          leading: Icon(
                            definition.icon,
                            color: AppTheme.primaryColor,
                          ),
                          title: Text(definition.label.replaceAll('\n', ' ')),
                          subtitle: Text(type),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                tooltip: 'Remove',
                                onPressed: () => _toggle(type),
                                icon: const Icon(Icons.close),
                              ),
                              const Icon(Icons.drag_handle),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                const SizedBox(height: 20),
                const Text(
                  'Available Actions',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 8),
                ..._availableDefinitions.map((definition) {
                  final checked = _selected.contains(definition.type);

                  return CheckboxListTile(
                    value: checked,
                    onChanged: (_) => _toggle(definition.type),
                    secondary: Icon(
                      definition.icon,
                      color: checked
                          ? AppTheme.primaryColor
                          : context.appSecondaryText,
                    ),
                    title: Text(definition.label.replaceAll('\n', ' ')),
                    subtitle: Text(definition.type),
                    controlAffinity: ListTileControlAffinity.trailing,
                    contentPadding: EdgeInsets.zero,
                  );
                }),
                const SizedBox(height: 18),
                ElevatedButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 17,
                          height: 17,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                          ),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(
                    _saving ? 'Saving...' : 'Save $modeLabel Quick Actions',
                  ),
                ),
                const SizedBox(height: 20),
              ],
            ),
    );
  }

  void _selectProvider(String provider) {
    setState(() => _provider = provider);
  }
}

class _ProviderButton extends StatelessWidget {
  final String label;
  final String value;
  final bool selected;
  final ValueChanged<String> onTap;

  const _ProviderButton({
    required this.label,
    required this.value,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = AppTheme.providerColor(value);

    return Expanded(
      child: InkWell(
        onTap: () => onTap(value),
        borderRadius: BorderRadius.circular(9),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected ? color : context.appSurface,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 11,
              color: selected
                  ? (value == 'mtn' ? Colors.black : Colors.white)
                  : context.appSecondaryText,
            ),
          ),
        ),
      ),
    );
  }
}

class _QuickActionPreview extends StatelessWidget {
  final List<String> selected;
  final List<QuickActionDefinition> definitions;

  const _QuickActionPreview({
    required this.selected,
    required this.definitions,
  });

  QuickActionDefinition? _find(String type) {
    for (final definition in definitions) {
      if (definition.type == type) return definition;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final previewItems = <Widget>[];

    for (var index = 0; index < 9; index++) {
      if (index < selected.length) {
        final definition = _find(selected[index]);

        previewItems.add(
          Container(
            decoration: BoxDecoration(
              color: context.appSurface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: AppTheme.primaryColor.withOpacity(0.16),
              ),
            ),
            padding: const EdgeInsets.all(7),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  definition?.icon ?? Icons.apps,
                  color: AppTheme.primaryColor,
                  size: 23,
                ),
                const SizedBox(height: 5),
                Text(
                  definition?.label ?? selected[index],
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        );
      } else {
        previewItems.add(
          Container(
            decoration: BoxDecoration(
              color: context.appSurface.withOpacity(0.45),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: context.appSecondaryText.withOpacity(0.12),
              ),
            ),
            child: Icon(
              Icons.add,
              color: context.appSecondaryText.withOpacity(0.35),
            ),
          ),
        );
      }
    }

    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 3,
      crossAxisSpacing: 8,
      mainAxisSpacing: 8,
      childAspectRatio: 1.05,
      children: previewItems,
    );
  }
}
