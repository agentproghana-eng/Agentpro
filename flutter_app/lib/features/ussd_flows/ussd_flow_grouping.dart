class UssdFlowGroup {
  final String provider;
  final String transactionType;
  final String simRole;
  final List<Map<String, dynamic>> flows;

  const UssdFlowGroup({
    required this.provider,
    required this.transactionType,
    required this.simRole,
    required this.flows,
  });

  String get key => '$provider|$transactionType|$simRole';
}

String personalUssdFlowPresentationType(String transactionType) {
  return switch (transactionType.trim().toLowerCase()) {
    'send_money' ||
    'send_money_same_network' ||
    'send_money_cross_network' =>
      'transfer_money',
    'buy_mashup' => 'mashup',
    _ => transactionType.trim().toLowerCase(),
  };
}

List<UssdFlowGroup> groupUssdFlows(
  Iterable<dynamic> rawFlows, {
  required bool isPersonal,
}) {
  final grouped = <String, UssdFlowGroup>{};

  for (final raw in rawFlows) {
    if (raw is! Map) {
      continue;
    }

    final flow = Map<String, dynamic>.from(raw);

    final provider = flow['provider']?.toString().trim().toLowerCase() ?? '';

    final rawTransactionType =
        flow['transaction_type']?.toString().trim().toLowerCase() ?? '';

    final transactionType = isPersonal
        ? personalUssdFlowPresentationType(rawTransactionType)
        : rawTransactionType;

    if (provider.isEmpty || transactionType.isEmpty) {
      continue;
    }

    final simRole = _resolvedSimRole(flow, isPersonal: isPersonal);

    final key = '$provider|$transactionType|$simRole';

    final existing = grouped[key];

    if (existing == null) {
      grouped[key] = UssdFlowGroup(
        provider: provider,
        transactionType: transactionType,
        simRole: simRole,
        flows: [flow],
      );
    } else {
      existing.flows.add(flow);
    }
  }

  final groups = grouped.values.toList()
    ..sort((a, b) {
      final providerOrder = a.provider.compareTo(b.provider);
      if (providerOrder != 0) {
        return providerOrder;
      }

      final typeOrder = a.transactionType.compareTo(b.transactionType);

      if (typeOrder != 0) {
        return typeOrder;
      }

      return a.simRole.compareTo(b.simRole);
    });

  for (final group in groups) {
    group.flows.sort((a, b) {
      final scopeOrder = _scopePriority(a).compareTo(_scopePriority(b));

      if (scopeOrder != 0) {
        return scopeOrder;
      }

      final variantOrder = _variantSortKey(a).compareTo(_variantSortKey(b));

      if (variantOrder != 0) {
        return variantOrder;
      }

      return (a['id']?.toString() ?? '').compareTo(b['id']?.toString() ?? '');
    });
  }

  return groups;
}

String ussdFlowVariantLabel(Map<String, dynamic> flow) {
  final parts = <String>[];

  final transactionType =
      flow['transaction_type']?.toString().trim().toLowerCase() ?? '';

  if (transactionType == 'send_money_same_network') {
    return 'Same Network';
  }

  if (transactionType == 'send_money_cross_network') {
    return 'Other Network';
  }

  if (transactionType == 'buy_mashup') {
    parts.add('MashUp');
  }

  final recipientMode = flow['recipient_mode']?.toString().trim() ?? '';

  final bundleCategory = flow['bundle_category']?.toString().trim() ?? '';

  if (recipientMode.isNotEmpty) {
    parts.add(_humanize(recipientMode));
  }

  if (bundleCategory.isNotEmpty) {
    parts.add(_humanize(bundleCategory));
  }

  if (parts.isEmpty) {
    return 'Default flow';
  }

  return parts.join(' · ');
}

String ussdFlowRoleLabel(String role) {
  return switch (role) {
    'agent' => 'Agent SIM',
    'evd' => 'EVD SIM',
    'merchant' => 'Merchant SIM',
    'personal' => 'Personal',
    _ => _humanize(role),
  };
}

String _resolvedSimRole(Map<String, dynamic> flow, {required bool isPersonal}) {
  if (isPersonal) {
    return 'personal';
  }

  final explicitRole =
      flow['business_sim_role']?.toString().trim().toLowerCase() ?? '';

  if (explicitRole.isNotEmpty) {
    return explicitRole;
  }

  final isGlobal = flow['company_id'] == null && flow['owner_user_id'] == null;

  return isGlobal ? 'personal' : 'agent';
}

int _scopePriority(Map<String, dynamic> flow) {
  final userOwned = flow['owner_user_id'] != null;
  final companyOwned = flow['company_id'] != null;

  return userOwned || companyOwned ? 0 : 1;
}

String _variantSortKey(Map<String, dynamic> flow) {
  final recipient =
      flow['recipient_mode']?.toString().trim().toLowerCase() ?? '';

  final bundle = flow['bundle_category']?.toString().trim().toLowerCase() ?? '';

  return '$recipient|$bundle';
}

String _humanize(String value) {
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
