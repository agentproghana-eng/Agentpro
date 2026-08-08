// personal_register_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';
import '../../shared/theme/app_colors.dart';

/// Lightweight Personal Subscriber registration - a single form, no
/// company info, no approval wait. On success, the router picks up the
/// new AuthAuthenticated state automatically (same mechanism the Login
/// screen already relies on - it never explicitly navigates either) -
/// this screen only needs to handle the error case itself.
class PersonalRegisterScreen extends StatefulWidget {
  const PersonalRegisterScreen({super.key});
  @override
  State<PersonalRegisterScreen> createState() => _PersonalRegisterScreenState();
}

class _PersonalRegisterScreenState extends State<PersonalRegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _obscure = true, _obscureConfirm = true;

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    context.read<AuthBloc>().add(AuthRegisterPersonalEvent(
          firstName: _firstNameCtrl.text.trim(),
          lastName: _lastNameCtrl.text.trim(),
          email: _emailCtrl.text.trim(),
          phone: _phoneCtrl.text.trim(),
          password: _passwordCtrl.text,
        ));
  }

  @override
  void dispose() {
    for (final c in [
      _firstNameCtrl,
      _lastNameCtrl,
      _emailCtrl,
      _phoneCtrl,
      _passwordCtrl,
      _confirmCtrl
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<AuthBloc, AuthState>(
      listener: (context, state) {
        if (state is AuthError) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(state.message),
              backgroundColor: AppTheme.errorColor));
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Personal Account'),
          leading: BackButton(onPressed: () => context.pop()),
        ),
        body: BlocBuilder<AuthBloc, AuthState>(
          builder: (context, state) {
            final loading = state is AuthLoading;
            return Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  const Text('Create your Personal account',
                      style:
                          TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text(
                      'Free to start. No business registration or approval needed.',
                      style: TextStyle(
                          fontSize: 12, color: context.appSecondaryText)),
                  const SizedBox(height: 20),
                  Row(children: [
                    Expanded(
                        child: AppTextField(
                            controller: _firstNameCtrl,
                            label: 'First Name',
                            validator: (v) => v!.isEmpty ? 'Required' : null)),
                    const SizedBox(width: 12),
                    Expanded(
                        child: AppTextField(
                            controller: _lastNameCtrl,
                            label: 'Last Name',
                            validator: (v) => v!.isEmpty ? 'Required' : null)),
                  ]),
                  const SizedBox(height: 14),
                  AppTextField(
                    controller: _emailCtrl,
                    label: 'Email Address',
                    keyboardType: TextInputType.emailAddress,
                    prefixIcon: Icons.email_outlined,
                    validator: (v) =>
                        !v!.contains('@') ? 'Enter a valid email' : null,
                  ),
                  const SizedBox(height: 14),
                  AppTextField(
                    controller: _phoneCtrl,
                    label: 'Phone Number',
                    keyboardType: TextInputType.phone,
                    prefixIcon: Icons.phone_outlined,
                    validator: (v) => v!.isEmpty ? 'Required' : null,
                  ),
                  const SizedBox(height: 14),
                  AppTextField(
                    controller: _passwordCtrl,
                    label: 'Password',
                    obscureText: _obscure,
                    prefixIcon: Icons.lock_outline,
                    suffixIcon: IconButton(
                      icon: Icon(_obscure
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                    validator: (v) {
                      if (v!.length < 8) return 'Min 8 characters';
                      if (!v.contains(RegExp(r'[A-Z]'))) {
                        return 'Include an uppercase letter';
                      }
                      if (!v.contains(RegExp(r'[0-9]'))) {
                        return 'Include a number';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 14),
                  AppTextField(
                    controller: _confirmCtrl,
                    label: 'Confirm Password',
                    obscureText: _obscureConfirm,
                    prefixIcon: Icons.lock_outline,
                    suffixIcon: IconButton(
                      icon: Icon(_obscureConfirm
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined),
                      onPressed: () =>
                          setState(() => _obscureConfirm = !_obscureConfirm),
                    ),
                    validator: (v) => v != _passwordCtrl.text
                        ? 'Passwords do not match'
                        : null,
                  ),
                  const SizedBox(height: 24),
                  AppButton(
                      label: 'Create Account',
                      onPressed: _submit,
                      isLoading: loading),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
