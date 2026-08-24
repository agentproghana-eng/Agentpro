import '../../core/services/sim_card_service.dart';
import 'sim_role.dart';

class BusinessSimContext {
  final SimCard sim;
  final SimRole role;

  const BusinessSimContext({
    required this.sim,
    required this.role,
  });

  String get provider => sim.network;

  bool get isBusinessRole => isBusinessSimRole(role);
}

SimRole? simRoleFromPurpose(String? purpose) {
  switch (canonicalSimPurpose(purpose)) {
    case 'agent':
      return SimRole.agent;

    case 'subscriber':
      return SimRole.subscriber;

    case 'evd':
      return SimRole.evd;

    case 'merchant':
      return SimRole.merchant;

    default:
      return null;
  }
}

List<BusinessSimContext> businessSimsForProvider({
  required String provider,
  required Iterable<SimCard> sims,
  required Map<int, String> purposes,
}) {
  final result = <BusinessSimContext>[];

  for (final sim in sims) {
    if (sim.network != provider) {
      continue;
    }

    final role = simRoleFromPurpose(purposes[sim.slot]);

    if (role == null || !isBusinessSimRole(role)) {
      continue;
    }

    result.add(
      BusinessSimContext(
        sim: sim,
        role: role,
      ),
    );
  }

  result.sort(
    (a, b) => a.sim.slot.compareTo(b.sim.slot),
  );

  return result;
}
