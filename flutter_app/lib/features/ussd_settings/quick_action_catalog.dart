import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';

class QuickActionCatalogDefinition {
  final String provider;
  final String type;
  final String displayLabel;
  final String quickActionGroup;
  final List<QuickActionCatalogVariant> variants;

  const QuickActionCatalogDefinition({
    required this.provider,
    required this.type,
    required this.displayLabel,
    required this.quickActionGroup,
    this.variants = const [],
  });

  factory QuickActionCatalogDefinition.fromJson(
    Map<String, dynamic> json,
  ) {
    final variantsValue = json['variants'];

    return QuickActionCatalogDefinition(
      provider: (json['provider'] ?? '').toString().trim(),
      type: (json['transaction_type'] ?? '').toString().trim(),
      displayLabel: (json['display_label'] ?? '').toString().trim(),
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
    );
  }

  IconData get icon => quickActionCatalogIcon(type);
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
}

class QuickActionCatalog {
  final String mode;
  final Map<String, List<QuickActionCatalogDefinition>> byProvider;

  const QuickActionCatalog({
    required this.mode,
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

  static Future<QuickActionCatalog> load({
    required String mode,
  }) async {
    final response = await ApiClient.instance.get(
      '/users/me/quick-actions/catalog',
      queryParameters: {
        'mode': mode,
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

    final data = Map<String, dynamic>.from(root);
    final providerRows = data['providers'];

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

        byProvider[provider] = definitions;
      }
    }

    return QuickActionCatalog(
      mode: (data['mode'] ?? mode).toString(),
      byProvider: byProvider,
    );
  }
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

String? _nullableCatalogString(dynamic value) {
  if (value == null) {
    return null;
  }

  final text = value.toString().trim();

  return text.isEmpty ? null : text;
}
