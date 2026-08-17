import 'package:flutter/material.dart';

class QuickActionPreference {
  final String actionKey;
  final String? customName;
  final String? iconKey;
  final String? iconColorHex;
  final int position;
  final bool isVisible;

  const QuickActionPreference({
    required this.actionKey,
    this.customName,
    this.iconKey,
    this.iconColorHex,
    required this.position,
    this.isVisible = true,
  });

  factory QuickActionPreference.fromDynamic(
    dynamic value, {
    required int fallbackPosition,
  }) {
    // Backward compatibility with the old format:
    // ["cash_in", "cash_out"]
    if (value is String) {
      return QuickActionPreference(
        actionKey: value,
        position: fallbackPosition,
      );
    }

    if (value is Map) {
      final map = Map<String, dynamic>.from(value);

      return QuickActionPreference(
        actionKey: (map['action_key'] ?? '').toString(),
        customName: _nullableString(map['custom_name']),
        iconKey: _nullableString(map['icon_key']),
        iconColorHex: _nullableString(map['icon_color']),
        position:
            map['position'] is int ? map['position'] as int : fallbackPosition,
        isVisible: map['is_visible'] is bool ? map['is_visible'] as bool : true,
      );
    }

    throw const FormatException('Invalid Quick Action preference');
  }

  Map<String, dynamic> toJson() {
    return {
      'action_key': actionKey,
      'custom_name': customName,
      'icon_key': iconKey,
      'icon_color': iconColorHex,
      'position': position,
      'is_visible': isVisible,
    };
  }

  QuickActionPreference copyWith({
    String? actionKey,
    String? customName,
    bool clearCustomName = false,
    String? iconKey,
    bool clearIconKey = false,
    String? iconColorHex,
    bool clearIconColor = false,
    int? position,
    bool? isVisible,
  }) {
    return QuickActionPreference(
      actionKey: actionKey ?? this.actionKey,
      customName: clearCustomName ? null : customName ?? this.customName,
      iconKey: clearIconKey ? null : iconKey ?? this.iconKey,
      iconColorHex: clearIconColor ? null : iconColorHex ?? this.iconColorHex,
      position: position ?? this.position,
      isVisible: isVisible ?? this.isVisible,
    );
  }

  Color resolvedIconColor(Color defaultColor) {
    return quickActionColorFromHex(iconColorHex) ?? defaultColor;
  }

  String resolvedLabel(String defaultLabel) {
    final custom = customName?.trim();
    if (custom != null && custom.isNotEmpty) {
      return custom;
    }
    return defaultLabel;
  }

  static String? _nullableString(dynamic value) {
    if (value == null) return null;

    final text = value.toString().trim();
    return text.isEmpty ? null : text;
  }
}

List<QuickActionPreference> normalizePersonalQuickActionPreferences({
  required List<QuickActionPreference> preferences,
}) {
  final visible = preferences.where((item) => item.isVisible).toList();

  final hasSameNetwork = visible.any(
    (item) => item.actionKey == 'send_money_same_network',
  );

  final hasOtherNetwork = visible.any(
    (item) => item.actionKey == 'send_money_cross_network',
  );

  // Personal mode presents one Send Money action when both underlying
  // network variants are available. The Personal transaction screen
  // decides which concrete transaction type is required.
  if (!hasSameNetwork || !hasOtherNetwork) {
    return visible
        .take(9)
        .toList()
        .asMap()
        .entries
        .map(
          (entry) => entry.value.copyWith(position: entry.key),
        )
        .toList();
  }

  final normalized = <QuickActionPreference>[];
  var sendMoneyInserted = false;

  for (final preference in visible) {
    final isSendMoney = preference.actionKey == 'send_money_same_network' ||
        preference.actionKey == 'send_money_cross_network';

    if (isSendMoney) {
      if (!sendMoneyInserted) {
        normalized.add(
          preference.copyWith(
            actionKey: 'send_money',
            customName: 'Send Money',
          ),
        );
        sendMoneyInserted = true;
      }

      continue;
    }

    normalized.add(preference);
  }

  return normalized
      .take(9)
      .toList()
      .asMap()
      .entries
      .map(
        (entry) => entry.value.copyWith(position: entry.key),
      )
      .toList();
}

List<QuickActionPreference> normalizeBusinessQuickActionPreferences({
  required String provider,
  required List<QuickActionPreference> preferences,
}) {
  final normalizedProvider = provider.trim().toLowerCase();

  // Remove only obsolete system-generated labels. Genuine custom names
  // remain untouched.
  final cleaned = preferences.map((preference) {
    final customName = preference.customName?.trim().toLowerCase();

    if (normalizedProvider == 'mtn' &&
        preference.actionKey == 'send_money' &&
        customName == 'send money') {
      return preference.copyWith(clearCustomName: true);
    }

    if (preference.actionKey == 'bill_payment' &&
        customName == 'bill payment') {
      return preference.copyWith(clearCustomName: true);
    }

    return preference;
  }).toList();

  if (normalizedProvider != 'mtn') {
    return cleaned;
  }

  final legacyCashInIndex = cleaned.indexWhere(
    (item) => item.actionKey == 'cash_in',
  );

  if (legacyCashInIndex < 0) {
    return cleaned;
  }

  final normalized = <QuickActionPreference>[];

  for (var index = 0; index < cleaned.length; index++) {
    final preference = cleaned[index];

    if (index == legacyCashInIndex) {
      // MTN Agent Cash In is internally the send_money transaction.
      //
      // Preserve the old Cash In tile's position/icon/colour/visibility,
      // but use the canonical transaction type. If its saved name was
      // merely an old system label, let the semantic label resolver
      // provide the current "Cash In" wording.
      final oldName = preference.customName?.trim().toLowerCase();

      normalized.add(
        preference.copyWith(
          actionKey: 'send_money',
          clearCustomName: oldName == 'send money' || oldName == 'cash in',
        ),
      );

      continue;
    }

    // The canonical send_money action now occupies the old Cash In
    // position, so its former duplicate position is removed.
    if (preference.actionKey == 'send_money') {
      continue;
    }

    normalized.add(preference);
  }

  return normalized
      .asMap()
      .entries
      .map(
        (entry) => entry.value.copyWith(position: entry.key),
      )
      .toList();
}

class QuickActionIconOption {
  final String key;
  final String label;
  final IconData icon;

  const QuickActionIconOption({
    required this.key,
    required this.label,
    required this.icon,
  });
}

const List<QuickActionIconOption> kQuickActionIconOptions = [
  QuickActionIconOption(
    key: 'send',
    label: 'Send',
    icon: Icons.send_rounded,
  ),
  QuickActionIconOption(
    key: 'payments',
    label: 'Payments',
    icon: Icons.payments_rounded,
  ),
  QuickActionIconOption(
    key: 'wallet',
    label: 'Wallet',
    icon: Icons.account_balance_wallet_rounded,
  ),
  QuickActionIconOption(
    key: 'deposit',
    label: 'Deposit',
    icon: Icons.call_received_rounded,
  ),
  QuickActionIconOption(
    key: 'withdraw',
    label: 'Withdraw',
    icon: Icons.call_made_rounded,
  ),
  QuickActionIconOption(
    key: 'store',
    label: 'Store',
    icon: Icons.storefront_rounded,
  ),
  QuickActionIconOption(
    key: 'receipt',
    label: 'Receipt',
    icon: Icons.receipt_long_rounded,
  ),
  QuickActionIconOption(
    key: 'phone',
    label: 'Phone',
    icon: Icons.phone_android_rounded,
  ),
  QuickActionIconOption(
    key: 'data',
    label: 'Data',
    icon: Icons.wifi_rounded,
  ),
  QuickActionIconOption(
    key: 'balance',
    label: 'Balance',
    icon: Icons.account_balance_wallet_outlined,
  ),
  QuickActionIconOption(
    key: 'savings',
    label: 'Savings',
    icon: Icons.savings_rounded,
  ),
  QuickActionIconOption(
    key: 'swap',
    label: 'Transfer',
    icon: Icons.swap_horiz_rounded,
  ),
  QuickActionIconOption(
    key: 'business',
    label: 'Business',
    icon: Icons.business_rounded,
  ),
  QuickActionIconOption(
    key: 'bank',
    label: 'Bank',
    icon: Icons.account_balance_rounded,
  ),
  QuickActionIconOption(
    key: 'people',
    label: 'People',
    icon: Icons.people_alt_rounded,
  ),
  QuickActionIconOption(
    key: 'person',
    label: 'Person',
    icon: Icons.person_rounded,
  ),
  QuickActionIconOption(
    key: 'history',
    label: 'History',
    icon: Icons.history_rounded,
  ),
  QuickActionIconOption(
    key: 'analytics',
    label: 'Analytics',
    icon: Icons.analytics_rounded,
  ),
  QuickActionIconOption(
    key: 'calculator',
    label: 'Calculator',
    icon: Icons.calculate_rounded,
  ),
  QuickActionIconOption(
    key: 'qr_code',
    label: 'QR Code',
    icon: Icons.qr_code_scanner_rounded,
  ),
  QuickActionIconOption(
    key: 'bolt',
    label: 'Quick',
    icon: Icons.bolt_rounded,
  ),
  QuickActionIconOption(
    key: 'star',
    label: 'Favourite',
    icon: Icons.star_rounded,
  ),
];

IconData? quickActionIconFromKey(String? key) {
  if (key == null) return null;

  for (final option in kQuickActionIconOptions) {
    if (option.key == key) {
      return option.icon;
    }
  }

  return null;
}

class QuickActionColorOption {
  final String name;
  final String hex;
  final Color color;

  const QuickActionColorOption({
    required this.name,
    required this.hex,
    required this.color,
  });
}

const List<QuickActionColorOption> kQuickActionColorOptions = [
  QuickActionColorOption(
    name: 'AgentPro Teal',
    hex: '#00897B',
    color: Color(0xFF00897B),
  ),
  QuickActionColorOption(
    name: 'Blue',
    hex: '#1565C0',
    color: Color(0xFF1565C0),
  ),
  QuickActionColorOption(
    name: 'Purple',
    hex: '#6A1B9A',
    color: Color(0xFF6A1B9A),
  ),
  QuickActionColorOption(
    name: 'Orange',
    hex: '#D84315',
    color: Color(0xFFD84315),
  ),
  QuickActionColorOption(
    name: 'Red',
    hex: '#C62828',
    color: Color(0xFFC62828),
  ),
  QuickActionColorOption(
    name: 'Yellow',
    hex: '#FDD835',
    color: Color(0xFFFDD835),
  ),
  QuickActionColorOption(
    name: 'Gold',
    hex: '#F9A825',
    color: Color(0xFFF9A825),
  ),
  QuickActionColorOption(
    name: 'Blue Grey',
    hex: '#455A64',
    color: Color(0xFF455A64),
  ),
  QuickActionColorOption(
    name: 'Indigo',
    hex: '#3949AB',
    color: Color(0xFF3949AB),
  ),
  QuickActionColorOption(
    name: 'Pink',
    hex: '#D81B60',
    color: Color(0xFFD81B60),
  ),
];

Color? quickActionColorFromHex(String? hex) {
  if (hex == null) return null;

  final normalized = hex.trim().toUpperCase();

  for (final option in kQuickActionColorOptions) {
    if (option.hex == normalized) {
      return option.color;
    }
  }

  return null;
}
