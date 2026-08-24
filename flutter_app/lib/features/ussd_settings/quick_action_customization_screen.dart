import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import 'quick_action_preference.dart';
import 'quick_action_catalog.dart';

class QuickActionCustomizationScreen extends StatefulWidget {
  final bool isPersonal;
  final String quickActionRole;

  const QuickActionCustomizationScreen({
    super.key,
    required this.isPersonal,
    this.quickActionRole = '',
  });

  String get effectiveQuickActionRole {
    final explicit = quickActionRole.trim().toLowerCase();

    if (explicit.isNotEmpty) {
      return explicit;
    }

    return isPersonal ? 'subscriber' : 'agent';
  }

  @override
  State<QuickActionCustomizationScreen> createState() =>
      _QuickActionCustomizationScreenState();
}

class _QuickActionChoice {
  final QuickActionCatalogDefinition definition;
  final QuickActionCatalogVariant? variant;

  const _QuickActionChoice({required this.definition, this.variant});

  String? get bundleCategory => variant?.bundleCategory;
  String? get recipientMode => variant?.recipientMode;

  QuickActionPreference preferenceAt(int position) {
    return QuickActionPreference(
      actionKey: definition.type,
      bundleCategory: bundleCategory,
      recipientMode: recipientMode,
      position: position,
    );
  }

  String get identityKey => preferenceAt(0).identityKey;

  String get displayLabel =>
      preferenceAt(0).resolvedDisplayLabel(definition.displayLabel);

  String get technicalLabel {
    final fields = <String>[
      definition.type,
      if ((recipientMode ?? '').trim().isNotEmpty)
        'recipient: ${recipientMode!.trim()}',
      if ((bundleCategory ?? '').trim().isNotEmpty)
        'flow: ${bundleCategory!.trim()}',
    ];

    return fields.join(' · ');
  }
}

class _QuickActionCustomizationScreenState
    extends State<QuickActionCustomizationScreen> {
  String get _role => widget.effectiveQuickActionRole;

  bool get _isSubscriberRole => _role == 'subscriber';
  bool get _isAgentRole => _role == 'agent';

  String get _roleLabel => switch (_role) {
        'subscriber' => 'Subscriber',
        'evd' => 'EVD',
        'merchant' => 'Merchant',
        _ => 'Agent',
      };

  String get _preferenceField => switch (_role) {
        'subscriber' => 'subscriber_quick_actions',
        'evd' => 'evd_quick_actions',
        'merchant' => 'merchant_quick_actions',
        _ => 'agent_quick_actions',
      };
  String _provider = '';
  bool _loading = true;
  bool _saving = false;
  String? _error;

  QuickActionCatalog? _catalog;

  Map<String, List<QuickActionPreference>> _preferences = {};

  List<String> get _providers {
    return <String>{...?_catalog?.providers, ..._preferences.keys}.toList();
  }

  List<QuickActionCatalogDefinition> get _availableDefinitions =>
      _catalog?.definitionsFor(_provider) ??
      const <QuickActionCatalogDefinition>[];

  List<_QuickActionChoice> get _availableChoices {
    final choices = <_QuickActionChoice>[];

    for (final definition in _availableDefinitions) {
      // Keep the normal generic entry so existing behaviour remains
      // available even when a transaction also has detailed flow variants.
      choices.add(_QuickActionChoice(definition: definition));

      for (final variant in definition.variants) {
        final canonicalBundle =
            (variant.bundleCategory ?? '').trim().toLowerCase();

        // MTN MashUp page1/page2 are historical flow identities.
        // Live validation established that allocation digits 1-5 are
        // accepted directly, so page2 must not create duplicate-looking
        // Quick Actions. Keep page1 as the canonical selectable identity.
        if (definition.provider == 'mtn' &&
            definition.type == 'buy_mashup' &&
            canonicalBundle.contains('_page2_')) {
          continue;
        }
        final hasBundle = (variant.bundleCategory ?? '').trim().isNotEmpty;

        final hasRecipient = (variant.recipientMode ?? '').trim().isNotEmpty;

        if (!hasBundle && !hasRecipient) {
          continue;
        }

        choices.add(
          _QuickActionChoice(definition: definition, variant: variant),
        );
      }
    }

    return choices;
  }

  List<QuickActionPreference> get _selected =>
      _preferences[_provider] ?? <QuickActionPreference>[];

  @override
  void initState() {
    super.initState();
    _load();
  }

  QuickActionCatalogDefinition? _definitionFor(String type) {
    return _catalog?.definitionFor(_provider, type);
  }

  List<QuickActionPreference> _defaultPreferencesFor(String provider) {
    final definitions = _catalog?.definitionsFor(provider) ??
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

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    final mode = _isSubscriberRole ? 'personal' : 'business';

    QuickActionCatalog? catalog;
    var catalogLoaded = false;

    if (_isAgentRole || _isSubscriberRole) {
      try {
        catalog = await QuickActionCatalog.load(
          mode: mode,
        );
        catalogLoaded = true;
      } catch (_) {
        catalog = null;
      }
    } else {
      // EVD and Merchant are Business Mode roles, but their provider
      // menu trees are not interchangeable with Agent flows.
      //
      // Do not expose Agent templates until role-aware Flow Builder
      // definitions exist for the selected Business SIM role.
      catalog = null;
      catalogLoaded = true;
    }

    Map<String, dynamic> saved = <String, dynamic>{};
    var preferencesLoaded = false;

    try {
      final response = await ApiClient.instance.get('/users/me/quick-actions');

      final responseData = response.data;

      final data = responseData is Map
          ? Map<String, dynamic>.from(
              responseData['data'] is Map
                  ? responseData['data'] as Map
                  : const <String, dynamic>{},
            )
          : <String, dynamic>{};

      final savedValue = switch (_role) {
        'subscriber' => data['subscriber'] ?? data['personal'],
        'evd' => data['evd'],
        'merchant' => data['merchant'],
        _ => data['agent'],
      };

      saved = savedValue is Map
          ? Map<String, dynamic>.from(savedValue)
          : <String, dynamic>{};

      preferencesLoaded = true;
    } catch (_) {
      saved = <String, dynamic>{};
    }

    final parsed = <String, List<QuickActionPreference>>{};

    final providers = <String>{...?catalog?.providers, ...saved.keys}.toList();

    for (final provider in providers) {
      final providerValue = saved[provider];
      final definitions = catalog?.definitionsFor(provider) ??
          const <QuickActionCatalogDefinition>[];

      if (providerValue is List) {
        final items = <QuickActionPreference>[];

        for (var index = 0; index < providerValue.length; index++) {
          try {
            final preference = QuickActionPreference.fromDynamic(
              providerValue[index],
              fallbackPosition: index,
            );

            if (preference.actionKey.isEmpty) {
              continue;
            }

            items.add(preference);
          } catch (_) {
            continue;
          }
        }

        items.sort((a, b) => a.position.compareTo(b.position));

        final normalizedItems = widget.isPersonal
            ? items
            : normalizeBusinessQuickActionPreferences(
                provider: provider,
                preferences: items,
              );

        parsed[provider] = normalizedItems
            .take(9)
            .toList()
            .asMap()
            .entries
            .map((entry) => entry.value.copyWith(position: entry.key))
            .toList();
      } else {
        parsed[provider] = definitions
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
    }

    if (mounted == false) return;

    String? loadError;

    if (catalogLoaded == false && preferencesLoaded) {
      loadError = 'Global Quick Action templates are temporarily unavailable. '
          'Your saved actions are still available.';
    } else if (catalogLoaded && preferencesLoaded == false) {
      loadError = 'Could not load your saved Quick Action layout. '
          'Showing available Global templates.';
    } else if (catalogLoaded == false && preferencesLoaded == false) {
      loadError = 'Could not load Quick Actions.';
    }

    setState(() {
      _catalog = catalog;
      _preferences = parsed;
      _error = loadError;

      if (providers.isNotEmpty && providers.contains(_provider) == false) {
        _provider = providers.first;
      }

      _loading = false;
    });
  }

  void _toggleChoice(_QuickActionChoice choice) {
    final selected = List<QuickActionPreference>.from(_selected);

    final existingIndex = selected.indexWhere(
      (item) => item.identityKey == choice.identityKey,
    );

    setState(() {
      if (existingIndex >= 0) {
        selected.removeAt(existingIndex);
      } else {
        if (selected.length >= 9) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('A 3×3 grid can contain at most 9 actions.'),
            ),
          );
          return;
        }

        selected.add(choice.preferenceAt(selected.length));
      }

      _preferences[_provider] = selected
          .asMap()
          .entries
          .map((entry) => entry.value.copyWith(position: entry.key))
          .toList();
    });
  }

  void _removePreference(QuickActionPreference preference) {
    final selected = List<QuickActionPreference>.from(_selected);

    selected.removeWhere((item) => item.identityKey == preference.identityKey);

    setState(() {
      _preferences[_provider] = selected
          .asMap()
          .entries
          .map((entry) => entry.value.copyWith(position: entry.key))
          .toList();
    });
  }

  void _restoreDefaults() {
    setState(() {
      _preferences[_provider] = _defaultPreferencesFor(_provider);
    });
  }

  Future<void> _restoreAllDefaults() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Restore all providers?'),
        content: Text(
          'This will restore the first available '
          '$_roleLabel templates '
          'for every provider in the current catalog.',
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
      final restored = Map<String, List<QuickActionPreference>>.from(
        _preferences,
      );

      for (final provider in _catalog?.providers ?? const <String>[]) {
        restored[provider] = _defaultPreferencesFor(provider);
      }

      _preferences = restored;
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);

    try {
      final field = _preferenceField;

      final payload = {
        for (final entry in _preferences.entries)
          entry.key: entry.value.map((item) => item.toJson()).toList(),
      };

      await ApiClient.instance.patch(
        '/users/me/quick-actions',
        data: {field: payload},
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '$_roleLabel Quick Actions saved',
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

  void _updatePreference(
    QuickActionPreference preference,
    QuickActionPreference Function(QuickActionPreference current) update,
  ) {
    final selected = List<QuickActionPreference>.from(_selected);

    final index = selected.indexWhere(
      (item) => item.identityKey == preference.identityKey,
    );

    if (index < 0) return;

    selected[index] = update(selected[index]);

    setState(() {
      _preferences[_provider] = selected;
    });
  }

  Future<void> _renameAction(QuickActionPreference preference) async {
    final definition = _definitionFor(preference.actionKey);
    final defaultLabel = definition?.displayLabel ??
        quickActionTransactionLabel(preference.actionKey);
    var draftName = preference.customName ?? defaultLabel;

    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Rename Quick Action'),
          content: TextFormField(
            initialValue: draftName,
            maxLength: 25,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              labelText: 'Custom name',
              helperText: 'Original: $defaultLabel',
            ),
            onChanged: (value) {
              draftName = value;
            },
            onFieldSubmitted: (value) {
              final trimmed = value.trim();

              if (trimmed.isNotEmpty) {
                Navigator.of(dialogContext).pop(trimmed);
              }
            },
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(''),
              child: const Text('Use Default'),
            ),
            ElevatedButton(
              onPressed: () {
                final trimmed = draftName.trim();

                if (trimmed.isEmpty) {
                  return;
                }

                Navigator.of(dialogContext).pop(trimmed);
              },
              child: const Text('Save'),
            ),
          ],
        );
      },
    );

    if (!mounted || result == null) return;

    if (result.isEmpty) {
      _updatePreference(
        preference,
        (current) => current.copyWith(clearCustomName: true),
      );
      return;
    }

    _updatePreference(
      preference,
      (current) => current.copyWith(customName: result),
    );
  }

  Future<void> _chooseIcon(QuickActionPreference preference) async {
    final result = await showModalBottomSheet<String?>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        return SafeArea(
          child: SizedBox(
            height: MediaQuery.of(sheetContext).size.height * 0.65,
            child: Column(
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
                  child: Text(
                    'Choose an icon',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
                  ),
                ),
                TextButton.icon(
                  onPressed: () => Navigator.pop(sheetContext, ''),
                  icon: const Icon(Icons.restart_alt),
                  label: const Text('Use default icon'),
                ),
                const Divider(),
                Expanded(
                  child: GridView.builder(
                    padding: const EdgeInsets.all(16),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 4,
                      crossAxisSpacing: 10,
                      mainAxisSpacing: 10,
                      childAspectRatio: 0.9,
                    ),
                    itemCount: kQuickActionIconOptions.length,
                    itemBuilder: (context, index) {
                      final option = kQuickActionIconOptions[index];
                      final selected = preference.iconKey == option.key;

                      return InkWell(
                        onTap: () => Navigator.pop(sheetContext, option.key),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          decoration: BoxDecoration(
                            color: context.appSurface,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: selected
                                  ? AppTheme.primaryColor
                                  : context.appSecondaryText.withValues(
                                      alpha: 0.12,
                                    ),
                            ),
                          ),
                          padding: const EdgeInsets.all(8),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(option.icon, color: AppTheme.primaryColor),
                              const SizedBox(height: 6),
                              Text(
                                option.label,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                textAlign: TextAlign.center,
                                style: const TextStyle(fontSize: 9),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (result == null || !mounted) return;

    if (result.isEmpty) {
      _updatePreference(
        preference,
        (current) => current.copyWith(clearIconKey: true),
      );
      return;
    }

    _updatePreference(
      preference,
      (current) => current.copyWith(iconKey: result),
    );
  }

  Future<void> _chooseIconColor(QuickActionPreference preference) async {
    final selectedHex = preference.iconColorHex;

    final result = await showModalBottomSheet<String?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return SafeArea(
          top: false,
          child: Container(
            decoration: BoxDecoration(
              color: sheetContext.appSurface,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(24),
              ),
            ),
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 44,
                  height: 5,
                  decoration: BoxDecoration(
                    color: sheetContext.appSecondaryText.withValues(
                      alpha: 0.28,
                    ),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Change Icon Colour',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 20),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: kQuickActionColorOptions.length,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 5,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 18,
                    childAspectRatio: 0.72,
                  ),
                  itemBuilder: (context, index) {
                    final option = kQuickActionColorOptions[index];
                    final selected =
                        option.hex.toUpperCase() == selectedHex?.toUpperCase();

                    final checkColor =
                        option.hex == '#FDD835' || option.hex == '#F9A825'
                            ? Colors.black
                            : Colors.white;

                    return InkWell(
                      onTap: () => Navigator.pop(sheetContext, option.hex),
                      borderRadius: BorderRadius.circular(12),
                      child: Column(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: option.color,
                              shape: BoxShape.circle,
                              border: selected
                                  ? Border.all(
                                      color: AppTheme.primaryColor,
                                      width: 3,
                                    )
                                  : null,
                              boxShadow: selected
                                  ? [
                                      BoxShadow(
                                        color: AppTheme.primaryColor.withValues(
                                          alpha: 0.22,
                                        ),
                                        blurRadius: 6,
                                      ),
                                    ]
                                  : null,
                            ),
                            child: selected
                                ? Icon(Icons.check_rounded, color: checkColor)
                                : null,
                          ),
                          const SizedBox(height: 6),
                          Text(
                            option.name,
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
                    );
                  },
                ),
                const SizedBox(height: 10),
                TextButton.icon(
                  onPressed: () => Navigator.pop(sheetContext, ''),
                  icon: const Icon(Icons.restart_alt_rounded),
                  label: const Text('Use default colour'),
                ),
                const SizedBox(height: 2),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(sheetContext),
                    child: const Text('Cancel'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (!mounted || result == null) return;

    if (result.isEmpty) {
      _updatePreference(
        preference,
        (current) => current.copyWith(clearIconColor: true),
      );
      return;
    }

    _updatePreference(
      preference,
      (current) => current.copyWith(iconColorHex: result),
    );
  }

  String _titleCaseWords(String value) {
    return value
        .split(RegExp(r'\s+'))
        .where((part) => part.trim().isNotEmpty)
        .map((part) {
      final trimmed = part.trim();
      if (trimmed.isEmpty) return trimmed;
      return trimmed[0].toUpperCase() + trimmed.substring(1).toLowerCase();
    }).join(' ');
  }

  String _friendlyVariantLabel({
    String? recipientMode,
    String? bundleCategory,
    String empty = 'Available shortcut',
  }) {
    final parts = <String>[];

    final normalizedRecipient = (recipientMode ?? '').trim();
    final normalizedBundle = (bundleCategory ?? '').trim();

    if (normalizedRecipient.isNotEmpty) {
      switch (normalizedRecipient.toLowerCase()) {
        case 'self':
          parts.add('Self');
          break;
        case 'other':
          parts.add('Other number');
          break;
        case 'same_network':
          parts.add('Same network');
          break;
        case 'cross_network':
          parts.add('Other network');
          break;
        default:
          parts.add(_titleCaseWords(normalizedRecipient.replaceAll('_', ' ')));
      }
    }

    if (normalizedBundle.isNotEmpty) {
      parts.add(_titleCaseWords(normalizedBundle.replaceAll('_', ' ')));
    }

    return parts.isEmpty ? empty : parts.join(' · ');
  }

  String _choiceSubtitle(_QuickActionChoice choice) {
    return _friendlyVariantLabel(
      recipientMode: choice.recipientMode,
      bundleCategory: choice.bundleCategory,
    );
  }

  String _selectedActionSubtitle(
    QuickActionPreference preference,
    String defaultLabel,
  ) {
    final modeLabel = _roleLabel;

    final meta = _friendlyVariantLabel(
      recipientMode: preference.recipientMode,
      bundleCategory: preference.bundleCategory,
      empty: 'Shortcut on your $modeLabel dashboard',
    );

    if (preference.customName != null) {
      return 'Original: $defaultLabel · $meta';
    }

    return meta;
  }

  Future<void> _chooseIconBackgroundColor(
    QuickActionPreference preference,
  ) async {
    final selectedHex = preference.iconBackgroundColorHex;

    final result = await showModalBottomSheet<String?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return SafeArea(
          top: false,
          child: Container(
            decoration: BoxDecoration(
              color: sheetContext.appSurface,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(24),
              ),
            ),
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 44,
                  height: 5,
                  decoration: BoxDecoration(
                    color: sheetContext.appSecondaryText.withValues(
                      alpha: 0.28,
                    ),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Change Icon Background Colour',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 20),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: kQuickActionColorOptions.length,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 5,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 18,
                    childAspectRatio: 0.72,
                  ),
                  itemBuilder: (context, index) {
                    final option = kQuickActionColorOptions[index];
                    final selected =
                        option.hex.toUpperCase() == selectedHex?.toUpperCase();

                    final checkColor =
                        option.hex == '#FDD835' || option.hex == '#F9A825'
                            ? Colors.black
                            : Colors.white;

                    return InkWell(
                      onTap: () => Navigator.pop(sheetContext, option.hex),
                      borderRadius: BorderRadius.circular(12),
                      child: Column(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: option.color,
                              shape: BoxShape.circle,
                              border: selected
                                  ? Border.all(
                                      color: AppTheme.primaryColor,
                                      width: 3,
                                    )
                                  : null,
                              boxShadow: selected
                                  ? [
                                      BoxShadow(
                                        color: AppTheme.primaryColor.withValues(
                                          alpha: 0.22,
                                        ),
                                        blurRadius: 6,
                                      ),
                                    ]
                                  : null,
                            ),
                            child: selected
                                ? Icon(Icons.check_rounded, color: checkColor)
                                : null,
                          ),
                          const SizedBox(height: 6),
                          Text(
                            option.name,
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
                    );
                  },
                ),
                const SizedBox(height: 10),
                TextButton.icon(
                  onPressed: () => Navigator.pop(sheetContext, ''),
                  icon: const Icon(Icons.restart_alt_rounded),
                  label: const Text('Use default background'),
                ),
                const SizedBox(height: 2),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(sheetContext),
                    child: const Text('Cancel'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (!mounted || result == null) return;

    if (result.isEmpty) {
      _updatePreference(
        preference,
        (current) => current.copyWith(clearIconBackgroundColor: true),
      );
      return;
    }

    _updatePreference(
      preference,
      (current) => current.copyWith(iconBackgroundColorHex: result),
    );
  }

  void _reorder(int oldIndex, int newIndex) {
    final items = List<QuickActionPreference>.from(_selected);

    if (newIndex > oldIndex) {
      newIndex -= 1;
    }

    final item = items.removeAt(oldIndex);
    items.insert(newIndex, item);

    setState(() {
      _preferences[_provider] = items
          .asMap()
          .entries
          .map((entry) => entry.value.copyWith(position: entry.key))
          .toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    final modeLabel = _roleLabel;

    return Scaffold(
      appBar: AppBar(title: Text('$modeLabel Quick Actions')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  '$modeLabel Quick Actions',
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
                    style: const TextStyle(color: Colors.orange, fontSize: 11),
                  ),
                ],
                const SizedBox(height: 16),
                if (_providers.isEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: context.appSurface,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'No Global Quick Action templates are available for this mode yet.',
                      textAlign: TextAlign.center,
                    ),
                  )
                else
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (var index = 0;
                            index < _providers.length;
                            index++) ...[
                          _ProviderButton(
                            label: quickActionProviderLabel(_providers[index]),
                            value: _providers[index],
                            selected: _provider == _providers[index],
                            onTap: _selectProvider,
                          ),
                          if (index < _providers.length - 1)
                            const SizedBox(width: 7),
                        ],
                      ],
                    ),
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
                  definitions: _availableDefinitions,
                ),
                const SizedBox(height: 20),
                const Text(
                  'Selected Quick Actions — drag to reorder',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
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
                    buildDefaultDragHandles: false,
                    itemCount: _selected.length,
                    onReorderItem: _reorder,
                    itemBuilder: (context, index) {
                      final preference = _selected[index];
                      final definition = _definitionFor(preference.actionKey);

                      final defaultLabel = definition?.displayLabel ??
                          quickActionTransactionLabel(preference.actionKey);

                      final icon = quickActionIconFromKey(preference.iconKey) ??
                          definition?.icon ??
                          quickActionCatalogIcon(preference.actionKey);

                      final label = preference.resolvedDisplayLabel(
                        defaultLabel,
                      );

                      return Card(
                        key: ValueKey(preference.identityKey),
                        child: ListTile(
                          leading: InkWell(
                            onTap: () => _chooseIcon(preference),
                            borderRadius: BorderRadius.circular(24),
                            child: Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                color: preference.resolvedIconBackgroundColor(
                                  context.appTileColor(const Color(0xFFE6F4F1)),
                                ),
                                borderRadius: BorderRadius.circular(11),
                              ),
                              child: Icon(
                                icon,
                                color: preference.resolvedIconColor(
                                  AppTheme.primaryColor,
                                ),
                              ),
                            ),
                          ),
                          title: Text(
                            label,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            _selectedActionSubtitle(preference, defaultLabel),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          onTap: () => _renameAction(preference),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Transform.scale(
                                scale: 0.88,
                                child: Switch(
                                  value: preference.isVisible,
                                  onChanged: (value) {
                                    _updatePreference(
                                      preference,
                                      (current) =>
                                          current.copyWith(isVisible: value),
                                    );
                                  },
                                ),
                              ),
                              ReorderableDragStartListener(
                                index: index,
                                child: const Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 6),
                                  child: Icon(Icons.drag_handle_rounded),
                                ),
                              ),
                              PopupMenuButton<String>(
                                onSelected: (value) {
                                  if (value == 'rename') {
                                    _renameAction(preference);
                                  } else if (value == 'icon') {
                                    _chooseIcon(preference);
                                  } else if (value == 'color') {
                                    _chooseIconColor(preference);
                                  } else if (value == 'background') {
                                    _chooseIconBackgroundColor(preference);
                                  } else if (value == 'remove') {
                                    _removePreference(preference);
                                  }
                                },
                                itemBuilder: (context) => const [
                                  PopupMenuItem(
                                    value: 'rename',
                                    child: Text('Rename'),
                                  ),
                                  PopupMenuItem(
                                    value: 'icon',
                                    child: Text('Change icon'),
                                  ),
                                  PopupMenuItem(
                                    value: 'color',
                                    child: Row(
                                      children: [
                                        Icon(Icons.palette_outlined),
                                        SizedBox(width: 10),
                                        Text('Change icon colour'),
                                      ],
                                    ),
                                  ),
                                  PopupMenuItem(
                                    value: 'background',
                                    child: Row(
                                      children: [
                                        Icon(Icons.format_color_fill_outlined),
                                        SizedBox(width: 10),
                                        Text('Change icon background colour'),
                                      ],
                                    ),
                                  ),
                                  PopupMenuItem(
                                    value: 'remove',
                                    child: Text('Remove'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                const SizedBox(height: 20),
                const Text(
                  'Available Templates',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                ),
                const SizedBox(height: 4),
                Text(
                  'Templates come from active Global flows and are grouped by transaction category.',
                  style: TextStyle(
                    fontSize: 10.5,
                    color: context.appSecondaryText,
                  ),
                ),
                const SizedBox(height: 10),
                ..._buildGroupedAvailableActions(context),
                const SizedBox(height: 18),
                ElevatedButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 17,
                          height: 17,
                          child: CircularProgressIndicator(strokeWidth: 2),
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

  List<Widget> _buildGroupedAvailableActions(BuildContext context) {
    final grouped = <String, List<_QuickActionChoice>>{};

    for (final choice in _availableChoices) {
      final group = choice.definition.quickActionGroup.isEmpty
          ? 'Other Services'
          : choice.definition.quickActionGroup;

      grouped.putIfAbsent(group, () => <_QuickActionChoice>[]).add(choice);
    }

    final widgets = <Widget>[];

    for (final entry in grouped.entries) {
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 2),
          child: Text(
            entry.key,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: context.appSecondaryText,
            ),
          ),
        ),
      );

      for (final choice in entry.value) {
        final checked = _selected.any(
          (item) => item.identityKey == choice.identityKey,
        );

        widgets.add(
          CheckboxListTile(
            value: checked,
            onChanged: (_) => _toggleChoice(choice),
            secondary: Icon(
              choice.definition.icon,
              color: checked ? AppTheme.primaryColor : context.appSecondaryText,
            ),
            title: Text(choice.displayLabel),
            subtitle: Text(
              _choiceSubtitle(choice),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            controlAffinity: ListTileControlAffinity.trailing,
            contentPadding: EdgeInsets.zero,
          ),
        );
      }
    }

    if (widgets.isEmpty && _providers.isNotEmpty) {
      widgets.add(
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Text(
            'No active Global templates are available for '
            '${quickActionProviderLabel(_provider)}.',
            style: TextStyle(color: context.appSecondaryText),
          ),
        ),
      );
    }

    return widgets;
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

    return InkWell(
      onTap: () => onTap(value),
      borderRadius: BorderRadius.circular(9),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minWidth: 104),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
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
  final List<QuickActionPreference> selected;
  final List<QuickActionCatalogDefinition> definitions;

  const _QuickActionPreview({
    required this.selected,
    required this.definitions,
  });

  QuickActionCatalogDefinition? _find(String type) {
    for (final definition in definitions) {
      if (definition.type == type) return definition;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final visible = selected.where((item) => item.isVisible).toList();
    final previewItems = <Widget>[];

    for (var index = 0; index < 9; index++) {
      if (index < visible.length) {
        final preference = visible[index];
        final definition = _find(preference.actionKey);

        final icon = quickActionIconFromKey(preference.iconKey) ??
            definition?.icon ??
            quickActionCatalogIcon(preference.actionKey);

        final defaultLabel = definition?.displayLabel ??
            quickActionTransactionLabel(preference.actionKey);

        previewItems.add(
          Container(
            decoration: BoxDecoration(
              color: context.appSurface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: AppTheme.primaryColor.withValues(alpha: 0.16),
              ),
            ),
            padding: const EdgeInsets.all(7),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: preference.resolvedIconBackgroundColor(
                      context.appTileColor(const Color(0xFFE6F4F1)),
                    ),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    icon,
                    color: preference.resolvedIconColor(AppTheme.primaryColor),
                    size: 23,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  preference.resolvedDisplayLabel(defaultLabel),
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
              color: context.appSurface.withValues(alpha: 0.45),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: context.appSecondaryText.withValues(alpha: 0.12),
              ),
            ),
            child: Icon(
              Icons.add,
              color: context.appSecondaryText.withValues(alpha: 0.35),
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
