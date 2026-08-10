import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/storage_service.dart';
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
      // ICCID is the durable physical-SIM identity.
      queryParameters['sim_iccid'] = iccid;
    } else {
      // Never identify electronic money by provider + slot alone.
      //
      // This is the same conservative unresolved identity tuple used by
      // transaction posting and the Commission Transfer balance reader.
      queryParameters['installation_id'] = installationId;
      queryParameters['sim_subscription_id'] = sim.subscriptionId;
    }

    try {
      final response = await ApiClient.instance.get(
        '/balances/sim-wallet',
        queryParameters: queryParameters,
      );

      final rawData = response.data['data'];

      if (rawData is! Map) {
        throw const FormatException(
          'Invalid SIM wallet balance response',
        );
      }

      final data = Map<String, dynamic>.from(rawData);

      return _SimWalletBalance(
        sim: sim,
        workingBalance: _fmt(data['working_balance']),
        eFloatBalance: _fmt(data['e_float_balance']),
        commissionBalance: _fmt(data['commission_balance']),
        exactWalletExists: data['exact_wallet_exists'] == true,
        reconciliationRequired: data['reconciliation_required'] == true,
      );
    } catch (_) {
      return _SimWalletBalance(
        sim: sim,
        workingBalance: '0.00',
        eFloatBalance: '0.00',
        commissionBalance: '0.00',
        exactWalletExists: false,
        reconciliationRequired: false,
        error: 'Could not load this SIM wallet balance.',
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
      final cashFuture = ApiClient.instance.get(
        '/balances/cash-drawer',
      );

      var supportedSims = <SimCard>[];
      String? simWarning;

      try {
        var sims = await SimCardService.getSimCards();

        // Android can briefly report no subscriptions immediately after a
        // cold launch. Retry once before showing an empty SIM state.
        if (sims.isEmpty) {
          await Future.delayed(
            const Duration(milliseconds: 1200),
          );

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
        throw const FormatException(
          'Invalid cash drawer balance response',
        );
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
        supportedSims.map(
          (sim) => _loadSimWallet(
            sim,
            installationId,
          ),
        ),
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
      appBar: AppBar(
        title: const Text('My Balance'),
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(),
            )
          : _error != null
              ? Center(
                  child: Text(_error!),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    children: [
                      const Padding(
                        padding: EdgeInsets.only(
                          bottom: 8,
                        ),
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
                          providerLabel: _providerLabel(
                            balance.sim.network,
                          ),
                          provider: balance.sim.network,
                          sim: balance.sim,
                          working: balance.workingBalance,
                          eFloat: balance.eFloatBalance,
                          commission: balance.commissionBalance,
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

class _SimWalletBalance {
  final SimCard sim;
  final String workingBalance;
  final String eFloatBalance;
  final String commissionBalance;
  final bool exactWalletExists;
  final bool reconciliationRequired;
  final String? error;

  const _SimWalletBalance({
    required this.sim,
    required this.workingBalance,
    required this.eFloatBalance,
    required this.commissionBalance,
    required this.exactWalletExists,
    required this.reconciliationRequired,
    this.error,
  });
}

class _ProviderBalanceCard extends StatelessWidget {
  final String providerLabel;
  final String provider;
  final SimCard sim;
  final String working;
  final String eFloat;
  final String commission;
  final bool exactWalletExists;
  final bool reconciliationRequired;
  final String? error;
  final VoidCallback onChanged;

  const _ProviderBalanceCard({
    required this.providerLabel,
    required this.provider,
    required this.sim,
    required this.working,
    required this.eFloat,
    required this.commission,
    required this.exactWalletExists,
    required this.reconciliationRequired,
    required this.error,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final isTelecel = provider == 'telecel';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(
            bottom: 8,
            top: 8,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '$providerLabel • SIM ${sim.slot + 1}',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              Text(
                exactWalletExists
                    ? 'Exact SIM ledger'
                    : 'No ledger activity yet',
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
            text: error!,
          ),
          const SizedBox(height: 10),
        ] else ...[
          if (isTelecel) ...[
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
            label: isTelecel ? 'Float' : 'e-Float',
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
                  'Historical unassigned provider balance exists. It is not included in this physical SIM balance.',
            ),
          ],
        ],

        const SizedBox(height: 14),

        // Keep the existing balance action workflows unchanged in this
        // accounting-reader slice. Their destination screens perform their
        // own physical-SIM selection and validation.
        Row(
          children: [
            Expanded(
              child: _ActionChip(
                icon: Icons.call_received,
                label: 'Declare Float',
                route: '/balances/float-received',
                provider: provider,
                onChanged: onChanged,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _ActionChip(
                icon: Icons.payments_outlined,
                label: 'Adjust Cash',
                route: '/balances/cash-adjustment',
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
                label: 'Transfer Commission to e-Float',
                route: '/balances/commission-transfer',
                provider: provider,
                onChanged: onChanged,
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
      ],
    );
  }
}

class _BalanceNotice extends StatelessWidget {
  final IconData icon;
  final String text;

  const _BalanceNotice({
    required this.icon,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.appSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: context.appDivider,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icon,
            size: 18,
            color: AppTheme.primaryColor,
          ),
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
          colors: [
            colorStart,
            colorEnd,
          ],
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
                padding: const EdgeInsets.symmetric(
                  horizontal: 7,
                  vertical: 3,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(
                    alpha: 0.2,
                  ),
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
  final String provider;
  final VoidCallback onChanged;

  const _ActionChip({
    required this.icon,
    required this.label,
    required this.route,
    required this.provider,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(11),
      onTap: () async {
        await context.push(
          route,
          extra: {
            'provider': provider,
          },
        );

        onChanged();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(
          vertical: 12,
          horizontal: 6,
        ),
        decoration: BoxDecoration(
          color: context.appSurface,
          borderRadius: BorderRadius.circular(11),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(
                alpha: 0.05,
              ),
              blurRadius: 3,
              offset: const Offset(0, 1),
            ),
          ],
        ),
        child: Column(
          children: [
            Icon(
              icon,
              size: 18,
              color: AppTheme.primaryColor,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
