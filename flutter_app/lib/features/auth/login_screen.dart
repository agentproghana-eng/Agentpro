import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/services/biometric_service.dart';
import '../../core/services/storage_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_text_field.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _obscurePassword = true;
  bool _biometricAvailable = false;

  @override
  void initState() {
    super.initState();
    _checkBiometric();
  }

  Future<void> _checkBiometric() async {
    final enabled = await BiometricService.isBiometricEnabled();
    final refreshToken = await StorageService.getRefreshToken();
    final canResume = refreshToken != null && refreshToken.isNotEmpty;

    if (!mounted) return;

    setState(
      () => _biometricAvailable = enabled && canResume,
    );

    if (_biometricAvailable) {
      _tryBiometric();
    }
  }

  Future<void> _tryBiometric() async {
    final result = await BiometricService.authenticateToUnlock();
    if (!mounted) return;

    switch (result) {
      case BiometricResult.success:
        // Biometric unlocks the app only — it is never used as, or in place
        // of, the Mobile Money PIN. Restore the existing session.
        context.read<AuthBloc>().add(AuthUnlockEvent());
        break;
      case BiometricResult.lockedOut:
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Too many failed attempts. Try again shortly, or use your password.'),
        ));
        break;
      case BiometricResult.permanentlyLockedOut:
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Biometric login is locked. Please sign in with your password.'),
        ));
        break;
      case BiometricResult.cancelled:
      case BiometricResult.notAvailable:
      case BiometricResult.notEnrolled:
      case BiometricResult.error:
        // Silent — user can simply use the password field instead.
        break;
    }
  }

  void _login() {
    if (!_formKey.currentState!.validate()) return;
    context.read<AuthBloc>().add(AuthLoginEvent(
          email: _emailCtrl.text.trim(),
          password: _passwordCtrl.text,
        ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.appScaffoldBg,
      body: Stack(
        children: [
          BlocConsumer<AuthBloc, AuthState>(
            listener: (context, state) {
              if (state is AuthError) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                      content: Text(state.message),
                      backgroundColor: AppTheme.errorColor),
                );
              }
            },
            builder: (context, state) {
              return SafeArea(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: 48),

                        // Logo & Branding
                        Container(
                          alignment: Alignment.center,
                          child: Column(
                            children: [
                              Semantics(
                                label: 'Agent Pro Ghana logo',
                                image: true,
                                child: Image.asset(
                                  'assets/images/agentpro-logo-lockup.png',
                                  width: 220,
                                  fit: BoxFit.contain,
                                  filterQuality: FilterQuality.high,
                                ),
                              ),
                              const SizedBox(height: 16),
                              Text(
                                'Agent Pro Ghana',
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineSmall
                                    ?.copyWith(
                                      fontWeight: FontWeight.bold,
                                      color: AppTheme.primaryColor,
                                    ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'One App. Every Mobile Money Business.',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                      color: context.appSecondaryText,
                                    ),
                              ),
                            ],
                          ),
                        ),

                        const SizedBox(height: 48),

                        Text(
                          'Welcome back',
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text('Sign in to continue',
                            style: TextStyle(color: context.appSecondaryText)),

                        const SizedBox(height: 28),

                        AppTextField(
                          controller: _emailCtrl,
                          label: 'Email Address',
                          hint: 'you@example.com',
                          keyboardType: TextInputType.emailAddress,
                          prefixIcon: Icons.email_outlined,
                          validator: (v) => (v == null || !v.contains('@'))
                              ? 'Enter a valid email'
                              : null,
                        ),

                        const SizedBox(height: 16),

                        AppTextField(
                          controller: _passwordCtrl,
                          label: 'Password',
                          hint: '••••••••',
                          obscureText: _obscurePassword,
                          prefixIcon: Icons.lock_outline,
                          suffixIcon: IconButton(
                            icon: Icon(_obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined),
                            onPressed: () => setState(
                                () => _obscurePassword = !_obscurePassword),
                          ),
                          validator: (v) => (v == null || v.isEmpty)
                              ? 'Password is required'
                              : null,
                        ),

                        const SizedBox(height: 8),

                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: () =>
                                context.push('/auth/forgot-password'),
                            child: const Text('Forgot Password?'),
                          ),
                        ),

                        const SizedBox(height: 16),

                        AppButton(
                          label: 'Sign In',
                          onPressed: _login,
                          isLoading: state is AuthLoading,
                        ),

                        if (_biometricAvailable) ...[
                          const SizedBox(height: 16),
                          OutlinedButton.icon(
                            onPressed: _tryBiometric,
                            icon: const Icon(Icons.fingerprint),
                            label: const Text('Sign in with Biometrics'),
                          ),
                        ],

                        const SizedBox(height: 32),
                        const Divider(),
                        const SizedBox(height: 16),

                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text("Don't have an account?",
                                style:
                                    TextStyle(color: context.appSecondaryText)),
                            TextButton(
                              onPressed: () =>
                                  context.push('/auth/account-type'),
                              child: const Text('Create Account'),
                            ),
                          ],
                        ),

                        const SizedBox(height: 24),

                        // Provider logos
                        const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            _ProviderBadge(
                                'MTN', AppTheme.mtnColor, Colors.black),
                            SizedBox(width: 8),
                            _ProviderBadge(
                                'Telecel', AppTheme.telecelColor, Colors.white),
                            SizedBox(width: 8),
                            _ProviderBadge(
                                'AT Money', AppTheme.atColor, Colors.white),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
          Positioned(
            bottom: 8,
            right: 12,
            child: FutureBuilder<PackageInfo>(
              future: PackageInfo.fromPlatform(),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const SizedBox.shrink();
                final info = snapshot.data!;
                return Text(
                  'v${info.version}+${info.buildNumber}',
                  style: TextStyle(
                      fontSize: 10,
                      color: context.appSecondaryText.withValues(alpha: 0.6)),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }
}

class _ProviderBadge extends StatelessWidget {
  final String label;
  final Color bgColor;
  final Color textColor;
  const _ProviderBadge(this.label, this.bgColor, this.textColor);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration:
          BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(6)),
      child: Text(label,
          style: TextStyle(
              color: textColor, fontSize: 11, fontWeight: FontWeight.bold)),
    );
  }
}
