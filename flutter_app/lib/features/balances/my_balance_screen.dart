import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/storage_service.dart';
import 'my_balance_role_policy.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';

class MyBalanceScreen extends StatefulWidget {
  const MyBalanceScreen({super.key});

  @override
  State<MyBalanceScreen> createState() => _MyBalanceScreenState();
}

class _MyBalanceScreenState extends State<MyBalanceScreen> {
  bool _loading = true;
  String? _error;
  String? _simWarning;

  String _cashAtHand = '0.00';

  List<_SimWalletBalance> _simBalances = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  String _fmt(dynamic value) =>
      (double.tryParse(value?.toString() ?? '0') ?? 0).toStringAsFixed(2);

  String _providerLabel(String provider) {
    switch (provider) {
      case 'mtn':
        return 'MTN';
      case 'telecel':
        return 'Telecel';
      case 'at_money':
        return 'AirtelTigo';
      default:
        return provider;
    }
  }

  List<_RoleBalanceItem> _parseRoleBalances(dynamic rawBalances) {
    if (rawBalances is List == false) {
      return const [];
    }

    final balances = <_RoleBalanceItem>[];

    for (final rawItem in rawBalances) {
      if (rawItem is Map) {
        final item = Map<String, dynamic>.from(rawItem);

        final balanceCode = item['balance_code']?.toString().trim() ?? '';

        final displayLabel = item['display_label']?.toString().trim() ?? '';

        if (balanceCode.isEmpty || displayLabel.isEmpty) {
          continue;
        }

        balances.add(
          _RoleBalanceItem(
            balanceCode: balanceCode,
            displayLabel: displayLabel,
            amount: _fmt(item['current_balance']),
          ),
        );
      }
    }

    return balances;
  }

  Future<_SimWalletBalance> _loadSimWallet(
    SimCard sim,
    String? installationId,
  ) async {
    final queryParameters = <String, dynamic>{
      'provider': sim.network,
      'sim_slot': sim.slot,
    };

    final iccid = sim.iccid.trim();

    if (iccid.isNotEmpty) {
      queryParameters['sim_iccid'] = iccid;
    } else {
      queryParameters['installation_id'] = installationId;

      queryParameters['sim_subscription_id'] = sim.subscriptionId;
    }

    try {
      final response = await ApiClient.instance.get(
        '/balances/sim-wallet',
        queryParameters: queryParameters,
      );

      final rawData = response.data['data'];

      if (rawData is Map == false) {
        throw const FormatException('Invalid SIM wallet balance response');
      }

      final data = Map<String, dynamic>.from(rawData);

      final simRole = canonicalMyBalanceSimRole(data['sim_role']?.toString());

      if (simRole.isEmpty) {
        throw const FormatException('SIM role was not verified');
      }

      return _SimWalletBalance(
        sim: sim,
        simRole: simRole,
        balanceDomain: data['balance_domain']?.toString().trim() ?? simRole,
        workingBalance: _fmt(data['working_balance']),
        eFloatBalance: _fmt(data['e_float_balance']),
        commissionBalance: _fmt(data['commission_balance']),
        roleBalances: _parseRoleBalances(data['balances']),
        balanceSemanticsValidated: data['balance_semantics_validated'] == true,
        exactWalletExists: data['exact_wallet_exists'] == true,
        reconciliationRequired: data['reconciliation_required'] == true,
      );
    } catch (_) {
      return _SimWalletBalance(
        sim: sim,
        simRole: '',
        balanceDomain: '',
        workingBalance: '0.00',
        eFloatBalance: '0.00',
        commissionBalance: '0.00',
        roleBalances: const [],
        balanceSemanticsValidated: false,
        exactWalletExists: false,
        reconciliationRequired: false,
        error:
            'This SIM role or balance could not be verified. Electronic balances and SIM financial actions are hidden.',
      );
    }
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
        _simWarning = null;
      });
    }

    try {
      // Cash is independent of provider and physical SIM identity, so start
      // loading the one real cash drawer while Android SIM detection runs.
      final cashFuture = ApiClient.instance.get('/balances/cash-drawer');

      var supportedSims = <SimCard>[];
      String? simWarning;

      try {
        var sims = await SimCardService.getSimCards();

        // Android can briefly report no subscriptions immediately after a
        // cold launch. Retry once before showing an empty SIM state.
        if (sims.isEmpty) {
          await Future.delayed(const Duration(milliseconds: 1200));

          sims = await SimCardService.getSimCards();
        }

        supportedSims = sims.where((sim) => sim.isMoMoSupported).toList()
          ..sort((a, b) => a.slot.compareTo(b.slot));
      } on SimPermissionException {
        simWarning =
            'Phone permission is required to identify your physical SIM wallets.';
      } catch (_) {
        simWarning =
            'SIM cards could not be detected. Electronic balances are hidden to avoid showing money against the wrong SIM.';
      }

      final cashResponse = await cashFuture;
      final rawCash = cashResponse.data['data'];

      if (rawCash is! Map) {
        throw const FormatException('Invalid cash drawer balance response');
      }

      final cashData = Map<String, dynamic>.from(rawCash);
      final cashAtHand = _fmt(cashData['cash_at_hand']);

      String? installationId;

      if (supportedSims.any((sim) => sim.iccid.trim().isEmpty)) {
        installationId = await StorageService.getOrCreateInstallationId();
      }

      // Keep one request per physical SIM. Do not collapse by provider:
      // two Telecel SIMs are two distinct electronic wallets.
      final simBalances = await Future.wait(
        supportedSims.map((sim) => _loadSimWallet(sim, installationId)),
      );

      if (!mounted) return;

      setState(() {
        _cashAtHand = cashAtHand;
        _simBalances = simBalances;
        _simWarning = simWarning;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _error = 'Could not load balances';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Balance')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    children: [
                      const Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text(
                          'Cash Drawer',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      _BalanceCard(
                        label: 'Cash at Hand',
                        amount: _cashAtHand,
                        colorStart: const Color(0xFFB87E00),
                        colorEnd: const Color(0xFF8A6300),
                        tag: 'PHYSICAL',
                      ),
                      const SizedBox(height: 10),
                      _ActionChip(
                        icon: Icons.payments_outlined,
                        label: 'Adjust Cash',
                        route: '/balances/cash-adjustment',
                        onChanged: _load,
                      ),
                      const SizedBox(height: 24),
                      if (_simWarning != null) ...[
                        _BalanceNotice(
                          icon: Icons.sim_card_alert_outlined,
                          text: _simWarning!,
                        ),
                        const SizedBox(height: 20),
                      ],
                      if (_simWarning == null && _simBalances.isEmpty) ...[
                        const _BalanceNotice(
                          icon: Icons.sim_card_alert_outlined,
                          text:
                              'No supported Mobile Money SIM card was detected. Your physical cash drawer is still shown above.',
                        ),
                        const SizedBox(height: 20),
                      ],
                      for (final balance in _simBalances)
                        _ProviderBalanceCard(
                          providerLabel: _providerLabel(balance.sim.network),
                          provider: balance.sim.network,
                          sim: balance.sim,
                          simRole: balance.simRole,
                          balanceDomain: balance.balanceDomain,
                          working: balance.workingBalance,
                          eFloat: balance.eFloatBalance,
                          commission: balance.commissionBalance,
                          roleBalances: balance.roleBalances,
                          balanceSemanticsValidated:
                              balance.balanceSemanticsValidated,
                          exactWalletExists: balance.exactWalletExists,
                          reconciliationRequired:
                              balance.reconciliationRequired,
                          error: balance.error,
                          onChanged: _load,
                        ),
                    ],
                  ),
                ),
    );
  }
}

class _RoleBalanceItem {
  final String balanceCode;
  final String displayLabel;
  final String amount;

  const _RoleBalanceItem({
    required this.balanceCode,
    required this.displayLabel,
    required this.amount,
  });
}

class _SimWalletBalance {
  final SimCard sim;
  final String simRole;
  final String balanceDomain;
  final String workingBalance;
  final String eFloatBalance;
  final String commissionBalance;
  final List<_RoleBalanceItem> roleBalances;
  final bool balanceSemanticsValidated;
  final bool exactWalletExists;
  final bool reconciliationRequired;
  final String? error;

  const _SimWalletBalance({
    required this.sim,
    required this.simRole,
    required this.balanceDomain,
    required this.workingBalance,
    required this.eFloatBalance,
    required this.commissionBalance,
    required this.roleBalances,
    required this.balanceSemanticsValidated,
    required this.exactWalletExists,
    required this.reconciliationRequired,
    this.error,
  });
}

class _ProviderBalanceCard extends StatelessWidget {
  final String providerLabel;
  final String provider;
  final SimCard sim;
  final String simRole;
  final String balanceDomain;
  final String working;
  final String eFloat;
  final String commission;
  final List<_RoleBalanceItem> roleBalances;
  final bool balanceSemanticsValidated;
  final bool exactWalletExists;
  final bool reconciliationRequired;
  final String? error;
  final VoidCallback onChanged;

  const _ProviderBalanceCard({
    required this.providerLabel,
    required this.provider,
    required this.sim,
    required this.simRole,
    required this.balanceDomain,
    required this.working,
    required this.eFloat,
    required this.commission,
    required this.roleBalances,
    required this.balanceSemanticsValidated,
    required this.exactWalletExists,
    required this.reconciliationRequired,
    required this.error,
    required this.onChanged,
  });

  Map<String, String> _simIdentityQuery() {
    final queryParameters = <String, String>{'sim_slot': sim.slot.toString()};

    final iccid = sim.iccid.trim();

    if (iccid.isNotEmpty) {
      queryParameters['sim_iccid'] = iccid;
    } else {
      queryParameters['sim_subscription_id'] = sim.subscriptionId.toString();
    }

    return queryParameters;
  }

  String _transactionRoute(String transactionType) {
    return Uri(
      path: '/transactions',
      queryParameters: {
        'type': transactionType,
        'provider': provider,
        ..._simIdentityQuery(),
      },
    ).toString();
  }

  String _balanceActionRoute(String path) {
    return Uri(path: path, queryParameters: _simIdentityQuery()).toString();
  }

  String _statusLabel({required bool isAgent}) {
    if (error != null) {
      return 'Role unavailable';
    }

    if (simRole.isEmpty) {
      return 'Role unverified';
    }

    if (isAgent) {
      return exactWalletExists
          ? 'Exact Agent ledger'
          : 'No Agent ledger activity yet';
    }

    if (balanceSemanticsValidated) {
      return exactWalletExists
          ? 'Role balance ledger'
          : 'Validated balance domain';
    }

    return 'Balance setup pending';
  }

  @override
  Widget build(BuildContext context) {
    final isAgent = myBalanceUsesAgentLedger(simRole);

    final isTelecelAgent = isAgent && provider == 'telecel';

    final roleLabel = myBalanceSimRoleLabel(simRole);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8, top: 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '$providerLabel • SIM ${sim.slot + 1} • $roleLabel',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              Text(
                _statusLabel(isAgent: isAgent),
                style: TextStyle(
                  fontSize: 10,
                  color: context.appSecondaryText,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
        if (error != null) ...[
          _BalanceNotice(
            icon: Icons.error_outline,
            text: error ?? 'Balance unavailable.',
          ),
          const SizedBox(height: 10),
        ] else if (isAgent) ...[
          if (isTelecelAgent) ...[
            _BalanceCard(
              label: 'Working Account',
              amount: working,
              colorStart: AppTheme.primaryColor,
              colorEnd: const Color(0xFF004D43),
              tag: 'ELECTRONIC',
            ),
            const SizedBox(height: 10),
          ],
          _BalanceCard(
            label: isTelecelAgent ? 'Float' : 'e-Float',
            amount: eFloat,
            colorStart: AppTheme.primaryColor,
            colorEnd: const Color(0xFF004D43),
            tag: 'ELECTRONIC',
          ),
          const SizedBox(height: 10),
          _BalanceCard(
            label: 'Commission',
            amount: commission,
            colorStart: const Color(0xFF5B4B8A),
            colorEnd: const Color(0xFF3E3260),
            tag: 'ELECTRONIC',
          ),
          if (reconciliationRequired) ...[
            const SizedBox(height: 10),
            const _BalanceNotice(
              icon: Icons.info_outline,
              text:
                  'Historical unassigned Agent balance exists. It is not included in this physical SIM balance.',
            ),
          ],
        ] else if (balanceSemanticsValidated && roleBalances.isNotEmpty) ...[
          for (final item in roleBalances) ...[
            _BalanceCard(
              label: item.displayLabel,
              amount: item.amount,
              colorStart: AppTheme.primaryColor,
              colorEnd: const Color(0xFF004D43),
              tag: 'ELECTRONIC',
            ),
            const SizedBox(height: 10),
          ],
        ] else ...[
          _BalanceNotice(
            icon: Icons.info_outline,
            text:
                '$roleLabel balance tracking for $providerLabel is not yet validated. Agent balances and Agent actions are hidden for this SIM.',
          ),
        ],
        if (isAgent && error == null) ...[
          const SizedBox(height: 14),
          if (isTelecelAgent) ...[
            Row(
              children: [
                Expanded(
                  child: _ActionChip(
                    icon: Icons.move_to_inbox_outlined,
                    label: 'Working Account to Float',
                    route: _transactionRoute('working_to_float'),
                    onChanged: onChanged,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _ActionChip(
                    icon: Icons.outbox_outlined,
                    label: 'Float to Working Account',
                    route: _transactionRoute('float_to_working'),
                    onChanged: onChanged,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
          ],
          Row(
            children: [
              Expanded(
                child: _ActionChip(
                  icon: Icons.call_received,
                  label: 'Declare Float',
                  route: _balanceActionRoute('/balances/float-received'),
                  provider: provider,
                  onChanged: onChanged,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _ActionChip(
                  icon: Icons.swap_horiz,
                  label: isTelecelAgent
                      ? 'Transfer Commission to Float'
                      : 'Transfer Commission to e-Float',
                  route: _transactionRoute(
                    'commission_transfer',
                  ),
                  provider: provider,
                  onChanged: onChanged,
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: 24),
      ],
    );
  }
}

class _BalanceNotice extends StatelessWidget {
  final IconData icon;
  final String text;

  const _BalanceNotice({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.appSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.appDivider),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppTheme.primaryColor),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12,
                height: 1.35,
                color: context.appSecondaryText,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  final String label;
  final String amount;
  final Color colorStart;
  final Color colorEnd;
  final String tag;

  const _BalanceCard({
    required this.label,
    required this.amount,
    required this.colorStart,
    required this.colorEnd,
    required this.tag,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [colorStart, colorEnd],
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label.toUpperCase(),
                style: const TextStyle(
                  color: Colors.white70,
                  fontWeight: FontWeight.bold,
                  fontSize: 11,
                  letterSpacing: 0.5,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(7),
                ),
                child: Text(
                  tag,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 8,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'GH₵ $amount',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final String route;
  final String? provider;
  final VoidCallback onChanged;

  const _ActionChip({
    required this.icon,
    required this.label,
    required this.route,
    this.provider,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(11),
      onTap: () async {
        await context.push(
          route,
          extra: provider == null ? null : {'provider': provider},
        );

        onChanged();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
        decoration: BoxDecoration(
          color: context.appSurface,
          borderRadius: BorderRadius.circular(11),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 3,
              offset: const Offset(0, 1),
            ),
          ],
        ),
        child: Column(
          children: [
            Icon(icon, size: 18, color: AppTheme.primaryColor),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }
}
