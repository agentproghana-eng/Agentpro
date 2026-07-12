import "package:flutter/material.dart";
import "package:dio/dio.dart";
import "package:go_router/go_router.dart";
import "../../core/api/api_client.dart";
import "../../core/services/storage_service.dart";
import "../../shared/theme/app_theme.dart";

class ForcePasswordChangeScreen extends StatefulWidget {
  const ForcePasswordChangeScreen({super.key});

  @override
  State<ForcePasswordChangeScreen> createState() => _ForcePasswordChangeScreenState();
}

class _ForcePasswordChangeScreenState extends State<ForcePasswordChangeScreen> {
  final _formKey = GlobalKey<FormState>();
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient.instance.patch("/users/me/password", data: {
        "current_password": _currentCtrl.text,
        "new_password": _newCtrl.text,
      });
      final user = await StorageService.getUser();
      if (user != null) {
        user["must_change_password"] = false;
        await StorageService.saveUser(user);
      }
      if (mounted) context.go("/");
    } on DioException catch (e) {
      setState(() {
        _error = e.response?.data?["message"] ?? "Failed to change password";
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        appBar: AppBar(title: const Text("Set a New Password"), automaticallyImplyLeading: false),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: ListView(
              children: [
                const Text(
                  "For your security, you must set a new password before continuing.",
                  style: TextStyle(fontSize: 15),
                ),
                const SizedBox(height: 24),
                TextFormField(
                  controller: _currentCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: "Temporary Password"),
                  validator: (v) => v!.isEmpty ? "Required" : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _newCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: "New Password"),
                  validator: (v) {
                    if (v!.length < 8) return "At least 8 characters";
                    if (!RegExp(r"[A-Z]").hasMatch(v)) return "Include an uppercase letter";
                    if (!RegExp(r"[0-9]").hasMatch(v)) return "Include a number";
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _confirmCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: "Confirm New Password"),
                  validator: (v) => v != _newCtrl.text ? "Passwords do not match" : null,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: AppTheme.errorColor)),
                ],
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _loading ? null : _submit,
                  child: _loading
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text("Set Password"),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
