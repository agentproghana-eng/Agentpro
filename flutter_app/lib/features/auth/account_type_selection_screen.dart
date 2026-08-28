// account_type_selection_screen.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';

/// Entry point for account creation - forks to the existing Business
/// registration (unchanged) or the new lightweight Personal
/// registration. Nothing about the Business path changes here; this
/// screen just sits in front of it as a choice.
class AccountTypeSelectionScreen extends StatelessWidget {
  const AccountTypeSelectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Account'),
        leading: BackButton(onPressed: () => context.pop()),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('How will you use AgentPro?',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 24),
            _AccountTypeCard(
              icon: Icons.store_outlined,
              title: 'I run a Mobile Money Business',
              subtitle:
                  'Manage agents, float, transactions, and staff for your MoMo business.',
              onTap: () => context.push('/auth/register'),
            ),
            const SizedBox(height: 16),
            _AccountTypeCard(
              icon: Icons.person_outline,
              title: "I'm a Personal User",
              subtitle:
                  'Send money, buy airtime/data, and check your own balances - free to start.',
              onTap: () => context.push('/auth/register-personal'),
            ),
          ],
        ),
      ),
    );
  }
}

class _AccountTypeCard extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;
  const _AccountTypeCard(
      {required this.icon,
      required this.title,
      required this.subtitle,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          border:
              Border.all(color: AppTheme.primaryColor.withValues(alpha: 0.3)),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(children: [
          Icon(icon, size: 32, color: AppTheme.primaryColor),
          const SizedBox(width: 14),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(title,
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 15)),
                const SizedBox(height: 4),
                Text(subtitle,
                    style: TextStyle(
                        fontSize: 12, color: context.appSecondaryText)),
              ])),
          const Icon(Icons.chevron_right),
        ]),
      ),
    );
  }
}
