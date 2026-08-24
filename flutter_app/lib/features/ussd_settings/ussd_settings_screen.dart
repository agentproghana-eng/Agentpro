import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';

class UssdSettingsScreen extends StatefulWidget {
  // Reused for both account modes, but the automation configuration
  // differs deliberately:
  //
  // Business may keep a per-user override for a legacy single-dial
  // template. Personal automation is Flow Builder-only and therefore
  // never reads or writes agent_ussd_overrides.
  final List<String>? transactionTypes;
  final bool isPersonal;

  const UssdSettingsScreen({
    super.key,
    this.transactionTypes,
    this.isPersonal = false,
  });

  @override
  State<UssdSettingsScreen> createState() => _UssdSettingsScreenState();
}

class _UssdSettingsScreenState extends State<UssdSettingsScreen> {
  String _provider = '';
  String _transactionType = '';
  final _patternCtrl = TextEditingController();
  final _operatorIdCtrl = TextEditingController();
  List<dynamic> _overrides = [];
  List<Map<String, dynamic>> _capabilities = [];
  bool _loading = true;
  bool _saving = false;
  bool _savingOperatorId = false;
  String? _loadError;

  List<String> get _providers {
    final values = <String>[];
    for (final capability in _capabilities) {
      final provider = capability['provider']?.toString() ?? '';
      if (provider.isNotEmpty && !values.contains(provider)) {
        values.add(provider);
      }
    }
    return values;
  }

  List<String> get _types {
    final values = <String>[];
    for (final capability in _capabilities) {
      if (capability['provider']?.toString() != _provider) continue;

      final type = capability['transaction_type']?.toString() ?? '';
      if (type.isNotEmpty && !values.contains(type)) {
        values.add(type);
      }
    }
    return values;
  }

  @override
  void initState() {
    super.initState();
    _loadOperatorId();
    _load();
  }

  @override
  void dispose() {
    _patternCtrl.dispose();
    _operatorIdCtrl.dispose();
    super.dispose();
  }

  void _loadOperatorId() {
    final state = context.read<AuthBloc>().state;
    if (state is AuthAuthenticated) {
      _operatorIdCtrl.text = state.user['telecel_operator_id'] ?? '';
    }
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _loadError = null;
      });
    }

    try {
      if (widget.isPersonal) {
        if (!mounted) return;

        setState(() {
          _overrides = [];
          _loading = false;
          _loadError = null;
        });
        return;
      }

      final responses = await Future.wait([
        ApiClient.instance.get('/ussd-overrides/capabilities'),
        ApiClient.instance.get('/ussd-overrides'),
      ]);

      if (!mounted) return;

      final rawCapabilities = responses[0].data['data'];
      final capabilities = rawCapabilities is List
          ? rawCapabilities
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList()
          : <Map<String, dynamic>>[];

      final providers = <String>[];
      for (final capability in capabilities) {
        final provider = capability['provider']?.toString() ?? '';
        if (provider.isNotEmpty && !providers.contains(provider)) {
          providers.add(provider);
        }
      }

      final initialProvider = providers.isNotEmpty ? providers.first : '';

      final initialTypes = capabilities
          .where(
            (capability) =>
                capability['provider']?.toString() == initialProvider,
          )
          .map((capability) => capability['transaction_type']?.toString() ?? '')
          .where((type) => type.isNotEmpty)
          .toList();

      setState(() {
        _capabilities = capabilities;
        _provider = initialProvider;
        _transactionType = initialTypes.isNotEmpty ? initialTypes.first : '';
        _overrides = responses[1].data['data'] ?? [];
        _loading = false;
        _loadError = null;
        _syncPatternField();
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _loading = false;
        _loadError =
            'USSD settings could not be loaded. Check your connection and try again.';
      });
    }
  }

  Map<String, dynamic>? get _currentOverride =>
      _overrides.cast<Map<String, dynamic>?>().firstWhere(
            (o) =>
                o!['provider'] == _provider &&
                o['transaction_type'] == _transactionType,
            orElse: () => null,
          );

  void _syncPatternField() {
    final existing = _currentOverride;
    _patternCtrl.text = existing != null ? existing['ussd_string_pattern'] : '';
  }

  Future<void> _save() async {
    if (_provider.isEmpty || _transactionType.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No active legacy USSD template is available.'),
        ),
      );
      return;
    }

    final pattern = _patternCtrl.text.trim();
    if (!pattern.startsWith('*') || !pattern.endsWith('#')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Pattern must start with * and end with #'),
        ),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      await ApiClient.instance.put(
        '/ussd-overrides',
        data: {
          'provider': _provider,
          'transaction_type': _transactionType,
          'ussd_string_pattern': pattern,
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Custom pattern saved')));
      }
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to save pattern'),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
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
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Reset to company default')),
        );
      }
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to reset'),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // Telecel Operator ID is fixed per agent (unlike dial patterns, which
  // are per provider+transaction_type) - required as part of Telecel's
  // USSD dial sequence, confirmed via live-device mapping. Saved via a
  // dedicated self-service endpoint, then merged into AuthBloc's cached
  // user so it's available immediately without a fresh login.
  Future<void> _saveOperatorId() async {
    final value = _operatorIdCtrl.text.trim();
    if (value.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Enter an Operator ID')));
      return;
    }
    setState(() => _savingOperatorId = true);
    try {
      await ApiClient.instance.patch(
        '/users/me/settings',
        data: {'telecel_operator_id': value},
      );
      if (mounted) {
        context.read<AuthBloc>().add(
              AuthUpdateUserEvent({'telecel_operator_id': value}),
            );
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Operator ID saved')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to save Operator ID'),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _savingOperatorId = false);
    }
  }

  String _providerLabel(String provider) {
    return switch (provider) {
      'mtn' => 'MTN',
      'telecel' => 'Telecel',
      'at_money' => 'AT Money',
      _ => provider
          .replaceAll('_', ' ')
          .split(' ')
          .where((part) => part.isNotEmpty)
          .map(
            (part) =>
                '${part[0].toUpperCase()}${part.substring(1).toLowerCase()}',
          )
          .join(' '),
    };
  }

  String _transactionTypeLabel(String transactionType) {
    for (final capability in _capabilities) {
      if (capability['provider']?.toString() == _provider &&
          capability['transaction_type']?.toString() == transactionType) {
        final name = capability['name']?.toString().trim() ?? '';
        if (name.isNotEmpty) return name;
      }
    }

    return transactionType
        .replaceAll('_', ' ')
        .split(' ')
        .where((part) => part.isNotEmpty)
        .map(
          (part) =>
              '${part[0].toUpperCase()}${part.substring(1).toLowerCase()}',
        )
        .join(' ');
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_loadError != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('USSD Automation')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.cloud_off_outlined, size: 44),
                const SizedBox(height: 12),
                Text(
                  _loadError!,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.appSecondaryText),
                ),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: _load,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Try Again'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('USSD Automation')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (!widget.isPersonal) ...[
            const Text(
              'Provider',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
            ),
            const SizedBox(height: 8),
            if (_providers.isEmpty)
              Text(
                'No active legacy USSD templates are available.',
                style: TextStyle(fontSize: 11, color: context.appSecondaryText),
              )
            else
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: _providers
                    .map(
                      (provider) => _ProviderPill(
                        label: _providerLabel(provider),
                        value: provider,
                        selected: _provider == provider,
                        color: AppTheme.providerColor(provider),
                        onTap: (value) {
                          setState(() {
                            _provider = value;
                            final types = _types;
                            _transactionType =
                                types.isNotEmpty ? types.first : '';
                            _syncPatternField();
                          });
                        },
                      ),
                    )
                    .toList(),
              ),
          ],
          if (!widget.isPersonal && _provider == 'telecel') ...[
            const SizedBox(height: 16),
            const Text(
              'Telecel Operator ID',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
            ),
            const SizedBox(height: 4),
            Text(
              'The same value is used for every Telecel transaction.',
              style: TextStyle(fontSize: 9.5, color: context.appSecondaryText),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _operatorIdCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                hintText: 'e.g. 8284',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _savingOperatorId ? null : _saveOperatorId,
              child: _savingOperatorId
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Save Operator ID'),
            ),
          ],
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.appSurface,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "${widget.isPersonal ? "Subscriber" : "Agent"} Quick Actions",
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Choose and reorder up to 9 dashboard actions in a 3×3 grid.',
                  style: TextStyle(
                    fontSize: 10.5,
                    color: context.appSecondaryText,
                  ),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () => context.push(
                    widget.isPersonal
                        ? '/personal-quick-actions'
                        : '/agent-quick-actions',
                  ),
                  icon: const Icon(Icons.grid_view_outlined),
                  label: const Text('Customize Quick Actions'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (widget.isPersonal) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: context.appSurface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Personal USSD Flows',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    'Personal automation uses Custom USSD Flows. '
                    'There is no separate dial-pattern override.',
                    style: TextStyle(
                      fontSize: 10.5,
                      color: context.appSecondaryText,
                    ),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () => context.push('/personal-ussd-flows'),
                    icon: const Icon(Icons.route_outlined),
                    label: const Text('Manage Custom USSD Flows'),
                  ),
                ],
              ),
            ),
          ] else ...[
            const Text(
              'Transaction Type',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: context.appSurface,
                borderRadius: BorderRadius.circular(10),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _transactionType.isNotEmpty &&
                          _types.contains(_transactionType)
                      ? _transactionType
                      : null,
                  isExpanded: true,
                  hint: const Text('No active transaction type'),
                  items: _types
                      .map(
                        (type) => DropdownMenuItem(
                          value: type,
                          child: Text(_transactionTypeLabel(type)),
                        ),
                      )
                      .toList(),
                  onChanged: _types.isEmpty
                      ? null
                      : (value) {
                          if (value == null) return;
                          setState(() {
                            _transactionType = value;
                            _syncPatternField();
                          });
                        },
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Your USSD Pattern',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _patternCtrl,
              style: const TextStyle(fontFamily: 'monospace'),
              decoration: const InputDecoration(
                hintText: '*170*1*2*{customer_phone}*{amount}#',
                border: OutlineInputBorder(),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Placeholders: {customer_phone}, {amount}, {reference}',
                style: TextStyle(
                  fontSize: 9.5,
                  color: context.appSecondaryText,
                ),
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.isDarkMode
                    ? const Color(0xFF332020)
                    : const Color(0xFFFBE4E4),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                'Never include a MoMo PIN in this pattern. '
                'The app can never dial, store, or see your PIN — '
                "it is always entered on the network's own screen.",
                style: TextStyle(
                  fontSize: 10.5,
                  color: context.isDarkMode
                      ? const Color(0xFFE57373)
                      : const Color(0xFFA33333),
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (_currentOverride != null)
              Center(
                child: TextButton(
                  onPressed: _saving ? null : _reset,
                  child: const Text('Reset to Company Default'),
                ),
              ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Save Custom Pattern'),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProviderPill extends StatelessWidget {
  final String label;
  final String value;
  final bool selected;
  final Color color;
  final void Function(String) onTap;

  const _ProviderPill({
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
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? color : context.appSurface,
          borderRadius: BorderRadius.circular(9),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.bold,
            color: selected
                ? (value == 'mtn' ? Colors.black : Colors.white)
                : context.appSecondaryText,
          ),
        ),
      ),
    );
  }
}
