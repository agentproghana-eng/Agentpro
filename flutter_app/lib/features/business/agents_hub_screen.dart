import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_bloc.dart';

class AgentsHubScreen extends StatelessWidget {
  const AgentsHubScreen({super.key});

  Future<void> _openFloat(
    BuildContext context,
    String? role,
  ) async {
    final balanceRoute =
        role == 'agent'
            ? '/my-balance'
            : '/float';

    final route =
        await showModalBottomSheet<String>(
      context: context,
      useSafeArea: true,
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding:
                const EdgeInsets.symmetric(
              vertical: 8,
            ),
            child: Column(
              mainAxisSize:
                  MainAxisSize.min,
              children: [
                const ListTile(
                  title: Text(
                    'Float',
                    style: TextStyle(
                      fontWeight:
                          FontWeight.bold,
                    ),
                  ),
                  subtitle: Text(
                    'Balance & Request',
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(
                    Icons
                        .account_balance_wallet_outlined,
                  ),
                  title: const Text(
                    'Balance',
                  ),
                  subtitle: Text(
                    role == 'agent'
                        ? 'View your cash and exact SIM balances'
                        : 'View branch float balances',
                  ),
                  onTap: () {
                    Navigator.of(
                      sheetContext,
                    ).pop(
                      balanceRoute,
                    );
                  },
                ),
                ListTile(
                  leading: const Icon(
                    Icons
                        .request_page_outlined,
                  ),
                  title: const Text(
                    'Request',
                  ),
                  subtitle: const Text(
                    'Open and review float requests',
                  ),
                  onTap: () {
                    Navigator.of(
                      sheetContext,
                    ).pop(
                      '/float/requests',
                    );
                  },
                ),
              ],
            ),
          ),
        );
      },
    );

    if (
        route != null &&
        context.mounted) {
      context.push(route);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState =
        context.watch<AuthBloc>().state;

    final user =
        authState is AuthAuthenticated
            ? authState.user
            : <String, dynamic>{};

    final role =
        user['role']?.toString();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Agent Hub'),
      ),
      body: ListView(
        padding:
            const EdgeInsets.all(16),
        children: [
          Text(
            'Operations',
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(
                  fontWeight:
                      FontWeight.bold,
                ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Your transaction, reporting, float and shift tools in one place.',
          ),
          const SizedBox(height: 20),
          _HubDestinationCard(
            icon:
                Icons.receipt_long_outlined,
            title:
                'Transaction History',
            subtitle:
                'View, search and review transactions',
            onTap: () => context.push(
              '/transactions/history',
            ),
          ),
          _HubDestinationCard(
            icon:
                Icons.bar_chart_outlined,
            title:
                'Report & Insight',
            subtitle:
                'Review transaction and performance insights',
            onTap: () => context.push(
              '/reports',
            ),
          ),
          _HubDestinationCard(
            icon: Icons
                .account_balance_wallet_outlined,
            title: 'Float',
            subtitle:
                'Balance & Request',
            onTap: () =>
                _openFloat(
              context,
              role,
            ),
          ),
          _HubDestinationCard(
            icon:
                Icons.fact_check_outlined,
            title:
                'Shift Reconciliation',
            subtitle:
                'Review shifts and reconciliation history',
            onTap: () => context.push(
              '/shifts/history',
            ),
          ),
        ],
      ),
    );
  }
}

class _HubDestinationCard
    extends StatelessWidget {
  const _HubDestinationCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin:
          const EdgeInsets.only(
        bottom: 12,
      ),
      child: ListTile(
        contentPadding:
            const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 8,
        ),
        leading: Icon(
          icon,
          size: 28,
        ),
        title: Text(
          title,
          style: const TextStyle(
            fontWeight:
                FontWeight.w700,
          ),
        ),
        subtitle: Text(
          subtitle,
        ),
        trailing: const Icon(
          Icons.chevron_right,
        ),
        onTap: onTap,
      ),
    );
  }
}
