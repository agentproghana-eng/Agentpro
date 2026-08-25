import '../../shared/models/sim_role.dart';

String canonicalMyBalanceSimRole(String? value) {
  final canonical = canonicalSimPurpose(value);

  if (const {'agent', 'subscriber', 'merchant', 'evd'}.contains(canonical)) {
    return canonical;
  }

  return '';
}

bool myBalanceUsesAgentLedger(String? role) =>
    canonicalMyBalanceSimRole(role) == 'agent';

String myBalanceSimRoleLabel(String? role) {
  switch (canonicalMyBalanceSimRole(role)) {
    case 'agent':
      return 'Agent SIM';

    case 'subscriber':
      return 'Subscriber SIM';

    case 'merchant':
      return 'Merchant SIM';

    case 'evd':
      return 'EVD SIM';

    default:
      return 'Unverified SIM';
  }
}
