import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/services/biometric_service.dart';
import '../../core/services/storage_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/agentpro_brand_lockup.dart';
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
    setState(() => _biometricAvailable = enabled && canResume);
    if (_biometricAvailable) _tryBiometric();
  }

  Future<void> _tryBiometric() async {
    final result = await BiometricService.authenticateToUnlock();
    if (!mounted) return;

    switch (result) {
      case BiometricResult.success:
        context.read<AuthBloc>().add(AuthUnlockEvent());
        break;
      case BiometricResult.lockedOut:
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Too many failed attempts. Try again shortly, or use your password.',
            ),
          ),
        );
        break;
      case BiometricResult.permanentlyLockedOut:
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Biometric login is locked. Please sign in with your password.',
            ),
          ),
        );
        break;
      case BiometricResult.cancelled:
      case BiometricResult.notAvailable:
      case BiometricResult.notEnrolled:
      case BiometricResult.error:
        break;
    }
  }

  void _login() {
    if (!_formKey.currentState!.validate()) return;
    context.read<AuthBloc>().add(
          AuthLoginEvent(
            email: _emailCtrl.text.trim(),
            password: _passwordCtrl.text,
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDarkMode;

    final systemUiStyle = SystemUiOverlayStyle(
      statusBarColor: isDark ? AppTheme.primaryDeep : context.appScaffoldBg,
      statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
      statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
      systemNavigationBarColor: context.appScaffoldBg,
      systemNavigationBarIconBrightness:
          isDark ? Brightness.light : Brightness.dark,
      systemNavigationBarDividerColor: Colors.transparent,
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: systemUiStyle,
      child: Scaffold(
        backgroundColor: context.appScaffoldBg,
        body: Stack(
          children: [
            BlocConsumer<AuthBloc, AuthState>(
              listener: (context, state) {
                if (state is AuthError) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(state.message),
                      backgroundColor: AppTheme.errorColor,
                    ),
                  );
                }
              },
              builder: (context, state) {
                return SafeArea(
                  child: Center(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(24, 18, 24, 36),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 520),
                        child: Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const AgentProBrandLockup(
                                iconSize: 96,
                                wordmarkSize: 36,
                                taglineSize: 13.5,
                                showTagline: true,
                              ),
                              const SizedBox(height: 34),
                              Text(
                                'Welcome back',
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineSmall
                                    ?.copyWith(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 27,
                                      letterSpacing: -0.45,
                                    ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Sign in to continue',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodyLarge
                                    ?.copyWith(color: context.appSecondaryText),
                              ),
                              const SizedBox(height: 22),
                              AppTextField(
                                controller: _emailCtrl,
                                label: 'Email Address',
                                hint: 'you@example.com',
                                keyboardType: TextInputType.emailAddress,
                                prefixIcon: Icons.mail_outline_rounded,
                                validator: (v) =>
                                    (v == null || !v.contains('@'))
                                        ? 'Enter a valid email'
                                        : null,
                              ),
                              const SizedBox(height: 16),
                              AppTextField(
                                controller: _passwordCtrl,
                                label: 'Password',
                                hint: '••••••••',
                                obscureText: _obscurePassword,
                                prefixIcon: Icons.lock_outline_rounded,
                                suffixIcon: IconButton(
                                  icon: Icon(
                                    _obscurePassword
                                        ? Icons.visibility_outlined
                                        : Icons.visibility_off_outlined,
                                  ),
                                  onPressed: () => setState(
                                    () => _obscurePassword = !_obscurePassword,
                                  ),
                                ),
                                validator: (v) => (v == null || v.isEmpty)
                                    ? 'Password is required'
                                    : null,
                              ),
                              const SizedBox(height: 2),
                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton(
                                  style: TextButton.styleFrom(
                                    textStyle: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 8,
                                    ),
                                    minimumSize: Size.zero,
                                    tapTargetSize:
                                        MaterialTapTargetSize.shrinkWrap,
                                  ),
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
                                const SizedBox(height: 14),
                                OutlinedButton.icon(
                                  onPressed: _tryBiometric,
                                  icon: const Icon(Icons.fingerprint_rounded),
                                  label: const Text('Sign in with Biometrics'),
                                ),
                              ],
                              const SizedBox(height: 32),
                              Row(
                                children: [
                                  const Expanded(child: Divider()),
                                  Padding(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 14),
                                    child: Text(
                                      'Or continue with',
                                      style: TextStyle(
                                        color: context.appSecondaryText,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ),
                                  const Expanded(child: Divider()),
                                ],
                              ),
                              const SizedBox(height: 20),
                              const Row(
                                children: [
                                  Expanded(
                                    child: _ProviderBadge(
                                      'MTN',
                                      AppTheme.mtnColor,
                                      Colors.black,
                                    ),
                                  ),
                                  SizedBox(width: 10),
                                  Expanded(
                                    child: _ProviderBadge(
                                      'Telecel',
                                      AppTheme.telecelColor,
                                      Colors.white,
                                    ),
                                  ),
                                  SizedBox(width: 10),
                                  Expanded(
                                    child: _ProviderBadge(
                                      'AT Money',
                                      AppTheme.atColor,
                                      Colors.white,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 24),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    "Don't have an account?",
                                    style: TextStyle(
                                        color: context.appSecondaryText),
                                  ),
                                  TextButton(
                                    onPressed: () =>
                                        context.push('/auth/account-type'),
                                    child: const Text('Create Account'),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.verified_user_outlined,
                                    size: 16,
                                    color: isDark
                                        ? AppTheme.primaryLight
                                        : AppTheme.primaryColor,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    'Secure  •  Fast  •  Reliable',
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall
                                        ?.copyWith(
                                          color: context.appSecondaryText,
                                          fontWeight: FontWeight.w500,
                                          fontSize: 11.5,
                                        ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
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
                      color: context.appSecondaryText.withValues(alpha: 0.55),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
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
  const _ProviderBadge(this.label, this.bgColor, this.textColor);

  final String label;
  final Color bgColor;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 42),
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(9),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Text(
        label,
        style: TextStyle(
          color: textColor,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
