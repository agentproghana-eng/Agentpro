import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';
import '../../shared/theme/app_colors.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _loading = false, _sent = false;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await ApiClient.instance.post('/auth/forgot-password',
          data: {'email': _emailCtrl.text.trim()});
      if (mounted) setState(() => _sent = true);
    } catch (_) {
      if (mounted) {
        setState(() => _sent = true); // Always show success (security)
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reset Password')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: _sent ? _buildSuccess() : _buildForm(),
      ),
    );
  }

  Widget _buildForm() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.lock_reset, size: 64, color: AppTheme.primaryColor),
          const SizedBox(height: 24),
          Text('Forgot your password?',
              style: Theme.of(context)
                  .textTheme
                  .headlineSmall
                  ?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text('Enter your email and we\'ll send you a reset link.',
              style: TextStyle(color: context.appSecondaryText)),
          const SizedBox(height: 32),
          AppTextField(
            controller: _emailCtrl,
            label: 'Email Address',
            keyboardType: TextInputType.emailAddress,
            prefixIcon: Icons.email_outlined,
            validator: (v) => !v!.contains('@') ? 'Enter a valid email' : null,
          ),
          const SizedBox(height: 24),
          AppButton(
              label: 'Send Reset Link',
              onPressed: _submit,
              isLoading: _loading),
          const SizedBox(height: 16),
          TextButton(
              onPressed: () => context.pop(),
              child: const Text('Back to Login')),
        ],
      ),
    );
  }

  Widget _buildSuccess() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Icon(Icons.mark_email_read,
            size: 80, color: AppTheme.successColor),
        const SizedBox(height: 24),
        Text('Check your email',
            textAlign: TextAlign.center,
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Text(
          'If ${_emailCtrl.text} is registered, you\'ll receive a password reset link shortly.\n\n'
          'The link expires in 1 hour.',
          textAlign: TextAlign.center,
          style: TextStyle(color: context.appSecondaryText),
        ),
        const SizedBox(height: 32),
        AppButton(
            label: 'Back to Login', onPressed: () => context.go('/auth/login')),
      ],
    );
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }
}
