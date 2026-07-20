import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/services/biometric_service.dart';
import '../../core/services/storage_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_text_field.dart';

const int _kPinLength = 4;

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

  // Offline PIN unlock. _pinAvailable mirrors _biometricAvailable's
  // pattern exactly - checked on load, no router/state-machine changes
  // needed, same architecture already proven for biometric. Unlike
  // biometric (an OS-level prompt), PIN entry needs an on-screen
  // keypad, so it doesn't auto-attempt on load - it just replaces the
  // email/password form with the pad until the user enters 4 digits
  // or explicitly chooses to use their password instead.
  bool _pinAvailable = false;
  bool _showPinPad = false;
  String _pinDigits = '';
  String? _pinErrorText;
  int _pinFailCount = 0;

  // Tracks whether the most recent successful login came from a real
  // email/password submission (as opposed to a PIN or biometric
  // unlock) - only a real password login should trigger the one-time
  // "set up a PIN?" offer, since PIN/biometric unlocks already prove a
  // PIN either exists or isn't wanted.
  bool _justPasswordLoggedIn = false;

  @override
  void initState() {
    super.initState();
    _checkBiometric();
    _checkPin();
  }

  Future<void> _checkPin() async {
    final pinSet = await StorageService.hasPinSet();
    if (!mounted) return;
    setState(() {
      _pinAvailable = pinSet;
      _showPinPad = pinSet;
    });
  }

  Future<void> _checkBiometric() async {
    final enabled = await BiometricService.isBiometricEnabled();
    if (!mounted) return;
    setState(() => _biometricAvailable = enabled);
    if (_biometricAvailable) _tryBiometric();
  }

  Future<void> _tryBiometric() async {
    final result = await BiometricService.authenticateToUnlock();
    if (!mounted) return;

    switch (result) {
      case BiometricResult.success:
        // Biometric unlocks the app only — it is never used as, or in place
        // of, the Mobile Money PIN. Restore the existing session.
        context.read<AuthBloc>().add(AuthCheckEvent());
        break;
      case BiometricResult.lockedOut:
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Too many failed attempts. Try again shortly, or use your password.'),
        ));
        break;
      case BiometricResult.permanentlyLockedOut:
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Biometric login is locked. Please sign in with your password.'),
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
    _justPasswordLoggedIn = true;
    context.read<AuthBloc>().add(AuthLoginEvent(
      email: _emailCtrl.text.trim(),
      password: _passwordCtrl.text,
    ));
  }

  void _onPinDigit(String digit) {
    if (_pinDigits.length >= _kPinLength) return;
    setState(() {
      _pinDigits += digit;
      _pinErrorText = null;
    });
    if (_pinDigits.length == _kPinLength) {
      context.read<AuthBloc>().add(AuthPinLoginEvent(_pinDigits));
    }
  }

  void _onPinBackspace() {
    if (_pinDigits.isEmpty) return;
    setState(() => _pinDigits = _pinDigits.substring(0, _pinDigits.length - 1));
  }

  void _useEmailInstead() {
    setState(() {
      _showPinPad = false;
      _pinDigits = '';
      _pinErrorText = null;
    });
  }

  Future<void> _offerPinSetup() async {
    final alreadySet = await StorageService.hasPinSet();
    if (alreadySet || !mounted) return;

    final wantsPin = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Set up a PIN?'),
        content: const Text('A 4-digit PIN lets you sign in instantly next time, even without internet — much faster than typing your email and password.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not now')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Set up PIN')),
        ],
      ),
    );

    if (wantsPin == true && mounted) {
      await _runPinSetupFlow();
    }
  }

  Future<void> _runPinSetupFlow() async {
    final firstEntry = await _showPinEntryDialog('Choose a 4-digit PIN');
    if (firstEntry == null || !mounted) return;

    final confirmEntry = await _showPinEntryDialog('Confirm your PIN');
    if (confirmEntry == null || !mounted) return;

    if (firstEntry != confirmEntry) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("PINs didn't match — you can set this up later in Settings")));
      return;
    }

    context.read<AuthBloc>().add(AuthSetPinEvent(firstEntry));
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('PIN set up — you can sign in instantly next time')));
  }

  Future<String?> _showPinEntryDialog(String title) {
    String digits = '';
    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(title),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            _PinDots(filled: digits.length),
            const SizedBox(height: 20),
            _NumericKeypad(
              onDigit: (d) {
                if (digits.length >= _kPinLength) return;
                digits += d;
                setDialogState(() {});
                if (digits.length == _kPinLength) {
                  Navigator.pop(ctx, digits);
                }
              },
              onBackspace: () {
                if (digits.isEmpty) return;
                digits = digits.substring(0, digits.length - 1);
                setDialogState(() {});
              },
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, null), child: const Text('Cancel')),
          ],
        ),
      ),
    );
  }

  Widget _buildPinPad(AuthState state) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 48),
      Container(
        alignment: Alignment.center,
        child: Column(children: [
          Container(
            width: 80, height: 80,
            decoration: BoxDecoration(color: AppTheme.primaryColor, borderRadius: BorderRadius.circular(20)),
            child: const Icon(Icons.lock_outline, color: Colors.white, size: 44),
          ),
          const SizedBox(height: 16),
          Text('Enter your PIN', style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
        ]),
      ),
      const SizedBox(height: 32),
      _PinDots(filled: _pinDigits.length, error: _pinErrorText != null),
      if (_pinErrorText != null) ...[
        const SizedBox(height: 8),
        Text(_pinErrorText!, textAlign: TextAlign.center, style: const TextStyle(color: AppTheme.errorColor, fontSize: 12)),
      ],
      const SizedBox(height: 32),
      _NumericKeypad(onDigit: _onPinDigit, onBackspace: _onPinBackspace),
      const SizedBox(height: 24),
      TextButton(onPressed: _useEmailInstead, child: const Text('Use email and password instead')),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          BlocConsumer<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is AuthError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: AppTheme.errorColor),
            );
          }
          if (state is AuthPinError) {
            setState(() {
              _pinErrorText = state.message;
              _pinDigits = '';
              _pinFailCount++;
            });
            HapticFeedback.vibrate();
            // After repeated failures, nudge toward the password
            // fallback rather than leaving someone stuck retrying a
            // PIN they may have forgotten.
            if (_pinFailCount >= 5) _useEmailInstead();
          }
          if (state is AuthAuthenticated && _justPasswordLoggedIn) {
            _justPasswordLoggedIn = false;
            _offerPinSetup();
          }
        },
        builder: (context, state) {
          if (_showPinPad) {
            return SafeArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: _buildPinPad(state),
              ),
            );
          }
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
                          Container(
                            width: 80, height: 80,
                            decoration: BoxDecoration(
                              color: AppTheme.primaryColor,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: const Icon(Icons.account_balance_wallet, color: Colors.white, size: 44),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Agent Pro Ghana',
                            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: AppTheme.primaryColor,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'One App. Every Mobile Money Business.',
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Colors.grey[600],
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 48),

                    Text(
                      'Welcome back',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text('Sign in to continue', style: TextStyle(color: Colors.grey[600])),

                    const SizedBox(height: 28),

                    AppTextField(
                      controller: _emailCtrl,
                      label: 'Email Address',
                      hint: 'you@example.com',
                      keyboardType: TextInputType.emailAddress,
                      prefixIcon: Icons.email_outlined,
                      validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
                    ),

                    const SizedBox(height: 16),

                    AppTextField(
                      controller: _passwordCtrl,
                      label: 'Password',
                      hint: '••••••••',
                      obscureText: _obscurePassword,
                      prefixIcon: Icons.lock_outline,
                      suffixIcon: IconButton(
                        icon: Icon(_obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                        onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                      ),
                      validator: (v) => (v == null || v.isEmpty) ? 'Password is required' : null,
                    ),

                    const SizedBox(height: 8),

                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () => context.push('/auth/forgot-password'),
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

                    if (_pinAvailable) ...[
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: () => setState(() { _showPinPad = true; _pinDigits = ''; _pinErrorText = null; }),
                        icon: const Icon(Icons.lock_outline),
                        label: const Text('Sign in with PIN'),
                      ),
                    ],

                    const SizedBox(height: 32),
                    const Divider(),
                    const SizedBox(height: 16),

                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text("Don't have an account?", style: TextStyle(color: Colors.grey[600])),
                        TextButton(
                          onPressed: () => context.push('/auth/register'),
                          child: const Text('Register Business'),
                        ),
                      ],
                    ),

                    const SizedBox(height: 24),

                    // Provider logos
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _ProviderBadge('MTN', AppTheme.mtnColor, Colors.black),
                        const SizedBox(width: 8),
                        _ProviderBadge('Telecel', AppTheme.telecelColor, Colors.white),
                        const SizedBox(width: 8),
                        _ProviderBadge('AT Money', AppTheme.atColor, Colors.white),
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
                "v${info.version}+${info.buildNumber}",
                style: TextStyle(fontSize: 10, color: Colors.grey.withOpacity(0.6)),
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

class _PinDots extends StatelessWidget {
  final int filled;
  final bool error;
  const _PinDots({required this.filled, this.error = false});

  @override
  Widget build(BuildContext context) {
    final color = error ? AppTheme.errorColor : AppTheme.primaryColor;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(_kPinLength, (i) {
        final isFilled = i < filled;
        return Container(
          width: 16, height: 16,
          margin: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isFilled ? color : Colors.transparent,
            border: Border.all(color: color, width: 2),
          ),
        );
      }),
    );
  }
}

class _NumericKeypad extends StatelessWidget {
  final void Function(String) onDigit;
  final VoidCallback onBackspace;
  const _NumericKeypad({required this.onDigit, required this.onBackspace});

  Widget _key(String label, {VoidCallback? onTap, Widget? child}) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(40),
        child: Container(
          margin: const EdgeInsets.all(6),
          height: 56,
          alignment: Alignment.center,
          child: child ?? Text(label, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Row(children: ['1', '2', '3'].map((d) => _key(d, onTap: () => onDigit(d))).toList()),
      Row(children: ['4', '5', '6'].map((d) => _key(d, onTap: () => onDigit(d))).toList()),
      Row(children: ['7', '8', '9'].map((d) => _key(d, onTap: () => onDigit(d))).toList()),
      Row(children: [
        _key('', onTap: null),
        _key('0', onTap: () => onDigit('0')),
        _key('', onTap: onBackspace, child: const Icon(Icons.backspace_outlined, size: 20)),
      ]),
    ]);
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
      decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(6)),
      child: Text(label, style: TextStyle(color: textColor, fontSize: 11, fontWeight: FontWeight.bold)),
    );
  }
}
