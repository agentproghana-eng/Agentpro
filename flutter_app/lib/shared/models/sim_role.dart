enum SimRole { agent, subscriber, evd, merchant }

String canonicalSimPurpose(String? purpose) {
  final normalized = purpose?.trim().toLowerCase();

  if (normalized == 'personal') {
    return 'subscriber';
  }

  return normalized ?? '';
}

bool isBusinessSimRole(SimRole role) => switch (role) {
      SimRole.agent => true,
      SimRole.evd => true,
      SimRole.merchant => true,
      SimRole.subscriber => false,
    };

bool isBusinessSimPurpose(String? purpose) {
  return const {
    'agent',
    'evd',
    'merchant',
  }.contains(canonicalSimPurpose(purpose));
}

bool isSubscriberSimPurpose(String? purpose) =>
    canonicalSimPurpose(purpose) == 'subscriber';

String simRoleQuickActionLabel(SimRole role) => switch (role) {
      SimRole.agent => 'Agent Quick Actions',
      SimRole.subscriber => 'Subscriber Quick Actions',
      SimRole.evd => 'EVD Quick Actions',
      SimRole.merchant => 'Merchant Quick Actions',
    };

String simRoleLabel(SimRole role) => switch (role) {
      SimRole.agent => 'Agent SIM',
      SimRole.subscriber => 'Subscriber SIM',
      SimRole.evd => 'EVD SIM',
      SimRole.merchant => 'Merchant SIM',
    };

List<SimRole> supportedSimRolesForProvider(String provider) {
  switch (provider.trim().toLowerCase()) {
    case 'mtn':
      return const [
        SimRole.agent,
        SimRole.subscriber,
        SimRole.evd,
        SimRole.merchant,
      ];
    case 'telecel':
      return const [SimRole.agent, SimRole.subscriber, SimRole.merchant];
    case 'at_money':
    case 'airteltigo':
      return const [SimRole.agent, SimRole.subscriber, SimRole.merchant];
    default:
      return const [SimRole.agent, SimRole.subscriber];
  }
}

bool simRoleSupportsProvider({
  required String provider,
  required SimRole role,
}) {
  return supportedSimRolesForProvider(provider).contains(role);
}
