// personal_home_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';

/// Minimal, safe landing screen for Personal Subscribers (role:
/// 'customer'). This is a deliberate placeholder for the full
/// provider-aware Quick Actions Home planned for a later build step -
/// it exists so registering as a Personal user has somewhere real and
/// functional to land right now, rather than falling through to the
/// router's default case (which currently points at the Agent
/// Dashboard - broken for a Personal user, since that screen assumes
/// company/branch context Personal users don't have).
class PersonalHomeScreen extends StatelessWidget {
  const PersonalHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthBloc>().state;
    final firstName = authState is AuthAuthenticated ? (authState.user['first_name'] ?? '') : '';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Agent Pro Ghana'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => context.read<AuthBloc>().add(AuthLogoutEvent()),
          ),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.person_outline, size: 64, color: AppTheme.primaryColor),
              const SizedBox(height: 16),
              Text('Welcome, $firstName!', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              const Text(
                'Your Personal account is active. The full Personal experience '
                '(transactions, Business Hub, Community) is being finished and '
                'will appear here soon.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
