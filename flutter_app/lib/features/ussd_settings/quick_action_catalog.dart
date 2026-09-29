import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../shared/utils/transaction_labels.dart';


class TransactionFormFieldDefinition {
  static const Set<String> supportedTypes = {
    'phone',
    'amount',
    'digits',
    'account_number',
    'selection',
    'text',
    'operator_id',
    'reference',
  };

  final String key;
  final String type;
  final String label;
  final bool isRequired;
  final int? minLength;
  final int? maxLength;
  final List<TransactionFormFieldOption> options;

  const TransactionFormFieldDefinition({
    required this.key,
    required this.type,
    required this.label,
    required this.isRequired,
    this.minLength,
    this.maxLength,
    this.options = const [],
  });

  factory TransactionFormFieldDefinition.fromJson(
    Map<String, dynamic> json,
  ) {
    final key = (json['key'] ?? '').toString().trim();
    final type = (json['type'] ?? '').toString().trim().toLowerCase();
    final label = (json['label'] ?? '').toString().trim();

    if (key.isEmpty ||
        !RegExp(r'^[a-z][a-z0-9_]{0,63}$').hasMatch(key)) {
      throw FormatException(
        'Invalid transaction form field key: $key',
      );
    }

    if (!supportedTypes.contains(type)) {
      throw FormatException(
        'Unsupported transaction form field type: $type',
      );
    }

    if (label.isEmpty) {
      throw FormatException(
        'Transaction form field label is required: $key',
      );
    }

    final minLength = _nullableCatalogInt(json['min_length']);
    final maxLength = _nullableCatalogInt(json['max_length']);

    if (minLength != null && minLength < 0) {
      throw FormatException(
        'Invalid min_length for transaction form field: $key',
      );
    }

    if (maxLength != null && maxLength < 1) {
      throw FormatException(
        'Invalid max_length for transaction form field: $key',
      );
    }

    if (minLength != null &&
        maxLength != null &&
        minLength > maxLength) {
      throw FormatException(
        'min_length cannot exceed max_length '
        'for transaction form field: $key',
      );
    }

    final optionsValue = json['options'];

    if (optionsValue != null && optionsValue is! List) {
      throw FormatException(
        'Invalid options for transaction form field: $key',
      );
    }

    final options = <TransactionFormFieldOption>[];

    if (optionsValue is List) {
      for (final value in optionsValue) {
        if (value is! Map) {
          throw FormatException(
            'Invalid option for transaction form field: $key',
          );
        }

        options.add(
          TransactionFormFieldOption.fromJson(
            Map<String, dynamic>.from(value),
          ),
        );
      }
    }

    if (type == 'selection' && options.isEmpty) {
      throw FormatException(
        'Selection transaction form field requires options: $key',
      );
    }

    final optionValues = <String>{};

    for (final option in options) {
      if (!optionValues.add(option.value)) {
        throw FormatException(
          'Duplicate transaction form option value '
          'for field $key: ${option.value}',
        );
      }
    }

    if (type != 'selection' && options.isNotEmpty) {
      throw FormatException(
        'Only selection transaction form fields '
        'may define options: $key',
      );
    }

    return TransactionFormFieldDefinition(
      key: key,
      type: type,
      label: label,
      isRequired: json['required'] != false,
      minLength: minLength,
      maxLength: maxLength,
      options: options,
    );
  }

  Map<String, dynamic> toCacheJson() => {
        'key': key,
        'type': type,
        'label': label,
        'required': isRequired,
        if (minLength != null) 'min_length': minLength,
        if (maxLength != null) 'max_length': maxLength,
        if (options.isNotEmpty)
          'options':
              options.map((option) => option.toCacheJson()).toList(),
      };
}

class TransactionFormFieldOption {
  final String value;
  final String label;

  const TransactionFormFieldOption({
    required this.value,
    required this.label,
  });

  factory TransactionFormFieldOption.fromJson(
    Map<String, dynamic> json,
  ) {
    final value = (json['value'] ?? '').toString().trim();
    final label = (json['label'] ?? '').toString().trim();

    if (value.isEmpty || label.isEmpty) {
      throw const FormatException(
        'Transaction form selection options '
        'require value and label',
      );
    }

    return TransactionFormFieldOption(
      value: value,
      label: label,
    );
  }

  Map<String, dynamic> toCacheJson() => {
        'value': value,
        'label': label,
      };
}

class QuickActionCatalogDefinition {
  final String provider;
  final String type;
  final String displayLabel;
  final String quickActionGroup;
  final List<QuickActionCatalogVariant> variants;
  final List<TransactionFormFieldDefinition> formFields;

  /// True when the server explicitly supplied V2 form_fields.
  ///
  /// An empty list is meaningful: the action is server-described but
  /// requires no generic transaction-form fields. This must remain
  /// distinguishable from legacy/V1 metadata where form_fields is absent.
  final bool hasServerDrivenFormSchema;

  const QuickActionCatalogDefinition({
    required this.provider,
    required this.type,
    required this.displayLabel,
    required this.quickActionGroup,
    this.variants = const [],
    this.formFields = const [],
    this.hasServerDrivenFormSchema = false,
  });

  factory QuickActionCatalogDefinition.fromJson(
    Map<String, dynamic> json,
  ) {
    final variantsValue = json['variants'];
    final provider = (json['provider'] ?? '').toString().trim();
    final type = (json['transaction_type'] ?? '').toString().trim();
    final catalogLabel = (json['display_label'] ?? '').toString().trim();

    return QuickActionCatalogDefinition(
      provider: provider,
      type: type,
      displayLabel: quickActionDisplayLabel(
        provider: provider,
        type: type,
        catalogLabel: catalogLabel,
      ),
      quickActionGroup:
          (json['quick_action_group'] ?? 'Other Services').toString().trim(),
      variants: variantsValue is List
          ? variantsValue
              .whereType<Map>()
              .map(
                (value) => QuickActionCatalogVariant.fromJson(
                  Map<String, dynamic>.from(value),
                ),
              )
              .toList()
          : const [],
      formFields: _parseTransactionFormFields(
        json['form_fields'],
      ),
      hasServerDrivenFormSchema: json.containsKey('form_fields'),
    );
  }

  IconData get icon => quickActionCatalogIcon(type);

  Map<String, dynamic> toCacheJson() {
    return {
      'provider': provider,
      'transaction_type': type,
      'display_label': displayLabel,
      'quick_action_group': quickActionGroup,
      'variants': variants.map((variant) => variant.toCacheJson()).toList(),
      if (hasServerDrivenFormSchema)
        'form_fields':
            formFields.map((field) => field.toCacheJson()).toList(),
    };
  }
}

List<TransactionFormFieldDefinition> _parseTransactionFormFields(
  dynamic rawValue,
) {
  if (rawValue == null) {
    return const <TransactionFormFieldDefinition>[];
  }

  if (rawValue is! List) {
    throw const FormatException(
      'Transaction form_fields must be a list',
    );
  }

  final fields = <TransactionFormFieldDefinition>[];
  final fieldKeys = <String>{};

  for (final rawField in rawValue) {
    if (rawField is! Map) {
      throw const FormatException(
        'Transaction form_fields entries must be objects',
      );
    }

    final field = TransactionFormFieldDefinition.fromJson(
      Map<String, dynamic>.from(rawField),
    );

    if (!fieldKeys.add(field.key)) {
      throw FormatException(
        'Duplicate transaction form field key: ${field.key}',
      );
    }

    fields.add(field);
  }

  return List<TransactionFormFieldDefinition>.unmodifiable(
    fields,
  );
}

class QuickActionCatalogVariant {
  final String? bundleCategory;
  final String? recipientMode;

  const QuickActionCatalogVariant({
    this.bundleCategory,
    this.recipientMode,
  });

  factory QuickActionCatalogVariant.fromJson(
    Map<String, dynamic> json,
  ) {
    return QuickActionCatalogVariant(
      bundleCategory: _nullableCatalogString(
        json['bundle_category'],
      ),
      recipientMode: _nullableCatalogString(
        json['recipient_mode'],
      ),
    );
  }
  Map<String, dynamic> toCacheJson() {
    return {
      'bundle_category': bundleCategory,
      'recipient_mode': recipientMode,
    };
  }
}

class QuickActionCatalog {
  static const int supportedSchemaVersion = 2;

  final String mode;
  final String role;
  final int schemaVersion;
  final Map<String, List<QuickActionCatalogDefinition>> byProvider;

  const QuickActionCatalog({
    required this.mode,
    required this.role,
    required this.schemaVersion,
    required this.byProvider,
  });

  List<String> get providers => byProvider.keys.toList();

  List<QuickActionCatalogDefinition> definitionsFor(
    String provider,
  ) {
    return byProvider[provider] ?? const [];
  }

  QuickActionCatalogDefinition? definitionFor(
    String provider,
    String type,
  ) {
    for (final definition in definitionsFor(provider)) {
      if (definition.type == type) {
        return definition;
      }
    }

    return null;
  }

  Map<String, dynamic> toCacheJson() {
    return {
      'mode': mode,
      'role': role,
      'schema_version': schemaVersion,
      'providers': byProvider.entries
          .map(
            (entry) => {
              'provider': entry.key,
              'actions': entry.value
                  .map((definition) => definition.toCacheJson())
                  .toList(),
            },
          )
          .toList(),
    };
  }

  static QuickActionCatalog fromCacheJson(
    Map<String, dynamic> data, {
    String? fallbackMode,
    String? fallbackRole,
  }) {
    final providerRows = data['providers'];
    final resolvedMode = (data['mode'] ?? fallbackMode ?? '').toString().trim();

    if (resolvedMode.isEmpty) {
      throw const FormatException(
        'Quick Action catalog mode is unavailable',
      );
    }

    final schemaValue = data['schema_version'];
    final schemaVersion = schemaValue == null
        ? 1
        : schemaValue is int
            ? schemaValue
            : int.tryParse(schemaValue.toString());

    if (schemaVersion == null ||
        schemaVersion < 1 ||
        schemaVersion > supportedSchemaVersion) {
      throw FormatException(
        'Unsupported Quick Action catalog schema: $schemaValue',
      );
    }

    final serverRole = (data['role'] ?? '').toString().trim();
    final resolvedRole = serverRole.isNotEmpty
        ? serverRole
        : (fallbackRole ?? _legacyCatalogRole(resolvedMode)).trim();

    if (resolvedRole.isEmpty) {
      throw const FormatException(
        'Quick Action catalog role is unavailable',
      );
    }

    if (!_catalogRoleMatchesMode(
      role: resolvedRole,
      mode: resolvedMode,
    )) {
      throw FormatException(
        'Quick Action catalog role $resolvedRole '
        'does not match mode $resolvedMode',
      );
    }

    final byProvider = <String, List<QuickActionCatalogDefinition>>{};

    if (providerRows is List) {
      for (final providerValue in providerRows) {
        if (providerValue is! Map) {
          continue;
        }

        final providerMap = Map<String, dynamic>.from(providerValue);

        final provider = (providerMap['provider'] ?? '').toString().trim();

        if (provider.isEmpty) {
          continue;
        }

        final definitions = <QuickActionCatalogDefinition>[];

        final actionRows = providerMap['actions'];

        if (actionRows is List) {
          for (final actionValue in actionRows) {
            if (actionValue is! Map) {
              continue;
            }

            final definition = QuickActionCatalogDefinition.fromJson(
              Map<String, dynamic>.from(actionValue),
            );

            if (definition.provider.isEmpty || definition.type.isEmpty) {
              continue;
            }

            definitions.add(definition);
          }
        }

        byProvider[provider] = resolvedMode == 'business'
            ? normalizeBusinessQuickActionDefinitions(
                provider: provider,
                definitions: definitions,
              )
            : definitions;
      }
    }

    return QuickActionCatalog(
      mode: resolvedMode,
      role: resolvedRole,
      schemaVersion: schemaVersion,
      byProvider: byProvider,
    );
  }

  static Future<QuickActionCatalog> load({
    required String mode,
  }) async {
    final response = await ApiClient.instance.get(
      '/users/me/quick-actions/catalog',
      queryParameters: {
        'mode': mode,
        'schema_version': supportedSchemaVersion,
      },
    );

    final responseData = response.data;

    if (responseData is! Map) {
      throw const FormatException(
        'Quick Action catalog response is invalid',
      );
    }

    final root = responseData['data'];

    if (root is! Map) {
      throw const FormatException(
        'Quick Action catalog data is unavailable',
      );
    }

    return fromCacheJson(
      Map<String, dynamic>.from(root),
      fallbackMode: _catalogAccountMode(mode),
      fallbackRole: _catalogRequestedRole(mode),
    );
  }
}

String _catalogRequestedRole(String value) {
  return switch (value.trim().toLowerCase()) {
    'business' || 'agent' => 'agent',
    'evd' => 'evd',
    'merchant' => 'merchant',
    'personal' || 'subscriber' => 'subscriber',
    _ => value.trim().toLowerCase(),
  };
}

String _catalogAccountMode(String value) {
  return switch (_catalogRequestedRole(value)) {
    'agent' || 'evd' || 'merchant' => 'business',
    'subscriber' => 'personal',
    _ => value.trim().toLowerCase(),
  };
}

String _legacyCatalogRole(String mode) {
  return switch (mode.trim().toLowerCase()) {
    'business' => 'agent',
    'personal' => 'subscriber',
    _ => '',
  };
}

bool _catalogRoleMatchesMode({
  required String role,
  required String mode,
}) {
  final normalizedRole = role.trim().toLowerCase();
  final normalizedMode = mode.trim().toLowerCase();

  if (normalizedMode == 'business') {
    return normalizedRole == 'agent' ||
        normalizedRole == 'evd' ||
        normalizedRole == 'merchant';
  }

  if (normalizedMode == 'personal') {
    return normalizedRole == 'subscriber';
  }

  return false;
}

List<QuickActionCatalogDefinition> normalizeBusinessQuickActionDefinitions({
  required String provider,
  required List<QuickActionCatalogDefinition> definitions,
}) {
  // Keep the server catalog authoritative.
  //
  // In particular, MTN Agent customization may contain the canonical
  // send_money action used by the Cash In/Out workspace as well as
  // individually supported cash actions. Do not collapse one into another:
  // if the user selects all supported actions, all remain selectable.
  return List<QuickActionCatalogDefinition>.from(definitions);
}

String quickActionDisplayLabel({
  required String provider,
  required String type,
  String? catalogLabel,
}) {
  if (provider.trim().toLowerCase() == 'telecel' &&
      type.trim().toLowerCase() == 'check_airtime_balance') {
    return 'Balance';
  }

  final semanticLabel = transactionTypeLabel(type, provider);
  final genericLabel = _humanizeCatalogValue(type);

  // Provider/accounting terminology wins over a stale or generic
  // catalog label. Examples:
  // - MTN send_money -> Cash In
  // - pay_to_agent -> Pay to Agent
  // - Telecel/AT Money cash_in -> Deposit
  if (semanticLabel != genericLabel) {
    return semanticLabel;
  }

  final normalizedCatalogLabel = catalogLabel?.trim();

  if (normalizedCatalogLabel != null && normalizedCatalogLabel.isNotEmpty) {
    return normalizedCatalogLabel;
  }

  return genericLabel;
}

String quickActionProviderLabel(String value) {
  return switch (value) {
    'mtn' => 'MTN',
    'telecel' => 'Telecel',
    'at_money' => 'AT Money',
    _ => _humanizeCatalogValue(value),
  };
}

String quickActionTransactionLabel(String value) {
  return _humanizeCatalogValue(value);
}

IconData quickActionCatalogIcon(String type) {
  final normalized = type.trim().toLowerCase();

  if (normalized.contains('airtime')) {
    return Icons.phone_android_outlined;
  }

  if (normalized.contains('data') || normalized.contains('bundle')) {
    return Icons.wifi_outlined;
  }

  if (normalized.contains('mashup')) {
    return Icons.card_giftcard_outlined;
  }

  if (normalized.contains('balance')) {
    return Icons.account_balance_wallet_outlined;
  }

  if (normalized.contains('commission')) {
    return Icons.savings_outlined;
  }

  if (normalized.contains('cash_in') || normalized.contains('deposit')) {
    return Icons.call_received;
  }

  if (normalized.contains('cash_out') || normalized.contains('withdraw')) {
    return Icons.call_made;
  }

  if (normalized.contains('send')) {
    return Icons.send_outlined;
  }

  if (normalized.contains('merchant')) {
    return Icons.storefront_outlined;
  }

  if (normalized.contains('bill') || normalized.contains('payment')) {
    return Icons.receipt_long_outlined;
  }

  if (normalized.contains('float') ||
      normalized.contains('working') ||
      normalized.contains('transfer')) {
    return Icons.swap_horiz_rounded;
  }

  return Icons.grid_view_rounded;
}

String _humanizeCatalogValue(String value) {
  final words = value
      .trim()
      .replaceAll('-', '_')
      .split('_')
      .where((word) => word.isNotEmpty)
      .map(
        (word) => word.length == 1
            ? word.toUpperCase()
            : '${word[0].toUpperCase()}${word.substring(1)}',
      )
      .toList();

  return words.isEmpty ? value : words.join(' ');
}


int? _nullableCatalogInt(dynamic value) {
  if (value == null) {
    return null;
  }

  if (value is int) {
    return value;
  }

  final parsed = int.tryParse(value.toString().trim());

  if (parsed == null) {
    throw const FormatException(
      'Transaction form numeric constraint must be an integer',
    );
  }

  return parsed;
}

String? _nullableCatalogString(dynamic value) {
  if (value == null) {
    return null;
  }

  final text = value.toString().trim();

  return text.isEmpty ? null : text;
}
