import 'package:flutter/material.dart';

import '../../../shared/theme/app_theme.dart';

class DashboardHeader extends StatelessWidget {
  final Map<String, dynamic> user;

  const DashboardHeader({
    super.key,
    required this.user,
  });

  @override
  Widget build(BuildContext context) {
    final firstName = user['first_name']?.toString() ?? '';
    final lastName = user['last_name']?.toString() ?? '';
    final fullName = '$firstName $lastName'.trim();
    final companyName = user['company_name']?.toString() ?? '';
    final role =
        (user['role']?.toString() ?? '').replaceAll('_', ' ').toUpperCase();

    return SafeArea(
      bottom: false,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppTheme.primaryColor,
              Color(0xFF004D43),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Image.asset(
                    'assets/images/agentpro-icon.png',
                    width: 32,
                    height: 32,
                    fit: BoxFit.contain,
                    filterQuality: FilterQuality.high,
                    isAntiAlias: true,
                  ),
                  const SizedBox(width: 9),
                  const Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: 'Agent',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            height: 1,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.65,
                          ),
                        ),
                        TextSpan(
                          text: 'Pro',
                          style: TextStyle(
                            color: AppTheme.secondaryColor,
                            fontSize: 20,
                            height: 1,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.65,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              fullName,
              style: const TextStyle(
                color: AppTheme.secondaryColor,
                fontSize: 15,
                fontWeight: FontWeight.w800,
              ),
            ),
            Text(
              companyName,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              role,
              style: const TextStyle(
                color: Colors.white60,
                fontSize: 9.5,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.8,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
