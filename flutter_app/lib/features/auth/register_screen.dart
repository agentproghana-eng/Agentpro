import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _companyNameCtrl = TextEditingController();
  final _regNumberCtrl = TextEditingController();
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _companyPhoneCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _obscure = true, _obscureConfirm = true, _loading = false;
  int _step = 0;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await ApiClient.instance.post('/auth/register', data: {
        'company_name': _companyNameCtrl.text.trim(),
        'registration_number': _regNumberCtrl.text.trim(),
        'company_phone': _companyPhoneCtrl.text.trim(),
        'first_name': _firstNameCtrl.text.trim(),
        'last_name': _lastNameCtrl.text.trim(),
        'email': _emailCtrl.text.trim(),
        'phone': _phoneCtrl.text.trim(),
        'password': _passwordCtrl.text,
      });

      if (!mounted) return;
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (_) => AlertDialog(
          icon: const Icon(Icons.check_circle, color: AppTheme.successColor, size: 48),
          title: const Text('Registration Submitted!'),
          content: const Text(
            'Your account is pending approval. Once our team verifies your '
            'subscription payment, you will receive an email and can log in.\n\n'
            'Typical review time: 24 hours.',
            textAlign: TextAlign.center,
          ),
          actions: [
            ElevatedButton(
              onPressed: () { Navigator.pop(context); context.go('/auth/login'); },
              child: const Text('Back to Login'),
            ),
          ],
        ),
      );
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? 'Registration failed. Please try again.';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Register Business'),
        leading: BackButton(onPressed: () => context.pop()),
      ),
      body: Form(
        key: _formKey,
        child: Stepper(
          currentStep: _step,
          onStepContinue: () {
            if (_step < 2) setState(() => _step++);
            else _submit();
          },
          onStepCancel: () {
            if (_step > 0) setState(() => _step--);
            else context.pop();
          },
          controlsBuilder: (context, details) => Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Row(
              children: [
                Expanded(
                  child: AppButton(
                    label: _step == 2 ? 'Submit Registration' : 'Continue',
                    onPressed: details.onStepContinue,
                    isLoading: _loading,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: AppButton(
                    label: _step == 0 ? 'Cancel' : 'Back',
                    onPressed: details.onStepCancel,
                    outlined: true,
                  ),
                ),
              ],
            ),
          ),
          steps: [
            // Step 1: Business Info
            Step(
              title: const Text('Business Info'),
              isActive: _step >= 0,
              state: _step > 0 ? StepState.complete : StepState.indexed,
              content: Column(children: [
                AppTextField(
                  controller: _companyNameCtrl,
                  label: 'Company / Business Name',
                  prefixIcon: Icons.business,
                  validator: (v) => v!.isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 14),
                AppTextField(
                  controller: _regNumberCtrl,
                  label: 'Ghana Card / Business Reg. Number',
                  prefixIcon: Icons.badge_outlined,
                ),
                const SizedBox(height: 14),
                AppTextField(
                  controller: _companyPhoneCtrl,
                  label: 'Business Phone',
                  prefixIcon: Icons.phone_outlined,
                  keyboardType: TextInputType.phone,
                ),
              ]),
            ),

            // Step 2: Your Details
            Step(
              title: const Text('Your Details'),
              isActive: _step >= 1,
              state: _step > 1 ? StepState.complete : StepState.indexed,
              content: Column(children: [
                Row(children: [
                  Expanded(child: AppTextField(controller: _firstNameCtrl, label: 'First Name',
                    validator: (v) => v!.isEmpty ? 'Required' : null)),
                  const SizedBox(width: 12),
                  Expanded(child: AppTextField(controller: _lastNameCtrl, label: 'Last Name',
                    validator: (v) => v!.isEmpty ? 'Required' : null)),
                ]),
                const SizedBox(height: 14),
                AppTextField(
                  controller: _emailCtrl, label: 'Email Address',
                  keyboardType: TextInputType.emailAddress, prefixIcon: Icons.email_outlined,
                  validator: (v) => !v!.contains('@') ? 'Enter valid email' : null,
                ),
                const SizedBox(height: 14),
                AppTextField(
                  controller: _phoneCtrl, label: 'Your Phone (MTN MoMo number)',
                  keyboardType: TextInputType.phone, prefixIcon: Icons.phone_outlined,
                  validator: (v) => v!.isEmpty ? 'Required' : null,
                ),
              ]),
            ),

            // Step 3: Password
            Step(
              title: const Text('Set Password'),
              isActive: _step >= 2,
              content: Column(children: [
                AppTextField(
                  controller: _passwordCtrl, label: 'Password', obscureText: _obscure,
                  prefixIcon: Icons.lock_outline,
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                  validator: (v) {
                    if (v!.length < 8) return 'Min 8 characters';
                    if (!v.contains(RegExp(r'[A-Z]'))) return 'Include an uppercase letter';
                    if (!v.contains(RegExp(r'[0-9]'))) return 'Include a number';
                    return null;
                  },
                ),
                const SizedBox(height: 14),
                AppTextField(
                  controller: _confirmCtrl, label: 'Confirm Password',
                  obscureText: _obscureConfirm, prefixIcon: Icons.lock_outline,
                  suffixIcon: IconButton(
                    icon: Icon(_obscureConfirm ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _obscureConfirm = !_obscureConfirm),
                  ),
                  validator: (v) => v != _passwordCtrl.text ? 'Passwords do not match' : null,
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.amber[50],
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.amber[200]!),
                  ),
                  child: const Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.info_outline, color: Colors.amber, size: 18),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'After registration, pay GH₵10 via MTN MoMo to activate your '
                          'Business Plan. Our team will verify and activate your account within 24 hours.',
                          style: TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
              ]),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    for (final c in [_companyNameCtrl, _regNumberCtrl, _firstNameCtrl, _lastNameCtrl,
      _emailCtrl, _phoneCtrl, _companyPhoneCtrl, _passwordCtrl, _confirmCtrl]) {
      c.dispose();
    }
    super.dispose();
  }
}
