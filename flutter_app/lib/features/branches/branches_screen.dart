import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

/// Business branch management.
///
/// Business owners may create and edit branches. Managers receive the same
/// branch visibility the backend grants them through branch_managers, but the
/// branch lifecycle itself remains owner-only.
class BranchesScreen extends StatefulWidget {
  const BranchesScreen({super.key});

  @override
  State<BranchesScreen> createState() => _BranchesScreenState();
}

class _BranchesScreenState extends State<BranchesScreen> {
  List<dynamic> _branches = [];
  bool _loading = true;
  String? _error;

  String? get _role {
    final state = context.read<AuthBloc>().state;
    return state is AuthAuthenticated ? state.user['role']?.toString() : null;
  }

  bool get _canManageBranches => _role == 'business_owner';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final res = await ApiClient.instance.get('/branches');

      if (!mounted) return;

      setState(() {
        _branches = List<dynamic>.from(res.data['data'] ?? const []);
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;

      setState(() {
        _error = e.response?.data?['message']?.toString() ??
            'Failed to load branches';
        _loading = false;
      });
    }
  }

  Future<void> _showBranchForm({
    Map<String, dynamic>? branch,
  }) async {
    if (!_canManageBranches) return;

    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _BranchFormSheet(branch: branch),
    );

    if (changed == true && mounted) {
      await _load();
    }
  }

  void _openFloat(Map<String, dynamic> branch) {
    final branchId = branch['id']?.toString();

    if (branchId == null || branchId.isEmpty) return;

    context.push(
      '/float?branch_id=${Uri.encodeQueryComponent(branchId)}',
    );
  }

  void _openTransactions(Map<String, dynamic> branch) {
    final branchId = branch['id']?.toString();

    if (branchId == null || branchId.isEmpty) return;

    context.push(
      '/transactions/history?branch_id=${Uri.encodeQueryComponent(branchId)}',
    );
  }

  @override
  Widget build(BuildContext context) {
    final canManage = _canManageBranches;

    return Scaffold(
      appBar: AppBar(
        title: Text(canManage ? 'Manage Branches' : 'Branches'),
      ),
      floatingActionButton: canManage
          ? FloatingActionButton.extended(
              onPressed: () => _showBranchForm(),
              icon: const Icon(Icons.add_business_outlined),
              label: const Text('Add Branch'),
            )
          : null,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? EmptyState(
                  icon: Icons.error_outline,
                  title: 'Could not load branches',
                  subtitle: _error,
                  actionLabel: 'Retry',
                  onAction: _load,
                )
              : _branches.isEmpty
                  ? EmptyState(
                      icon: Icons.store_outlined,
                      title: 'No branches yet',
                      subtitle: canManage
                          ? 'Create your first business location to get started.'
                          : 'No managed branches are currently available.',
                      actionLabel: canManage ? 'Add Branch' : null,
                      onAction: canManage ? () => _showBranchForm() : null,
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(8, 8, 8, 96),
                        itemCount: _branches.length,
                        itemBuilder: (_, i) {
                          final branch =
                              Map<String, dynamic>.from(_branches[i] as Map);

                          final float = double.tryParse(
                                branch['total_float']?.toString() ?? '0',
                              ) ??
                              0;

                          final name = branch['name']?.toString() ?? '';
                          final location =
                              branch['location']?.toString().trim() ?? '';
                          final status =
                              branch['status']?.toString().toUpperCase() ?? '';

                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ExpansionTile(
                              leading: CircleAvatar(
                                backgroundColor: AppTheme.primaryColor
                                    .withValues(alpha: 0.1),
                                child: const Icon(
                                  Icons.store,
                                  color: AppTheme.primaryColor,
                                ),
                              ),
                              title: Text(
                                name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              subtitle: location.isEmpty
                                  ? null
                                  : Text(
                                      location,
                                      style: const TextStyle(fontSize: 12),
                                    ),
                              trailing: GhsAmount(
                                amount: float,
                                fontSize: 13,
                              ),
                              children: [
                                Padding(
                                  padding:
                                      const EdgeInsets.fromLTRB(16, 0, 16, 12),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      _DetailRow(
                                        'Agents',
                                        '${branch['agent_count'] ?? 0}',
                                      ),
                                      _DetailRow(
                                        'Managers',
                                        '${branch['manager_count'] ?? 0}',
                                      ),
                                      _DetailRow('Status', status),
                                      if ((branch['phone']?.toString() ?? '')
                                          .trim()
                                          .isNotEmpty)
                                        _DetailRow(
                                          'Phone',
                                          branch['phone'].toString(),
                                        ),
                                      const SizedBox(height: 10),
                                      Row(
                                        children: [
                                          Expanded(
                                            child: OutlinedButton.icon(
                                              onPressed: () =>
                                                  _openFloat(branch),
                                              icon: const Icon(
                                                Icons.account_balance_wallet,
                                                size: 16,
                                              ),
                                              label: const Text('Float'),
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: OutlinedButton.icon(
                                              onPressed: () =>
                                                  _openTransactions(branch),
                                              icon: const Icon(
                                                Icons.receipt_long,
                                                size: 16,
                                              ),
                                              label: const Text('Transactions'),
                                            ),
                                          ),
                                        ],
                                      ),
                                      if (canManage) ...[
                                        const SizedBox(height: 8),
                                        OutlinedButton.icon(
                                          onPressed: () =>
                                              _showBranchForm(branch: branch),
                                          icon: const Icon(
                                            Icons.edit_outlined,
                                            size: 16,
                                          ),
                                          label: const Text('Edit Branch'),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}

class _BranchFormSheet extends StatefulWidget {
  final Map<String, dynamic>? branch;

  const _BranchFormSheet({
    this.branch,
  });

  @override
  State<_BranchFormSheet> createState() => _BranchFormSheetState();
}

class _BranchFormSheetState extends State<_BranchFormSheet> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _nameController;
  late final TextEditingController _locationController;
  late final TextEditingController _phoneController;

  late String _status;
  bool _saving = false;

  bool get _isEditing => widget.branch != null;

  @override
  void initState() {
    super.initState();

    final branch = widget.branch;

    _nameController = TextEditingController(
      text: branch?['name']?.toString() ?? '',
    );
    _locationController = TextEditingController(
      text: branch?['location']?.toString() ?? '',
    );
    _phoneController = TextEditingController(
      text: branch?['phone']?.toString() ?? '',
    );

    final existingStatus = branch?['status']?.toString();
    _status = const {
      'pending',
      'active',
      'suspended',
      'deactivated',
    }.contains(existingStatus)
        ? existingStatus!
        : 'active';
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_saving) return;

    setState(() => _saving = true);

    final payload = <String, dynamic>{
      'name': _nameController.text.trim(),
      'location': _locationController.text.trim(),
      'phone': _phoneController.text.trim(),
      if (_isEditing) 'status': _status,
    };

    try {
      if (_isEditing) {
        final branchId = widget.branch!['id']?.toString();

        if (branchId == null || branchId.isEmpty) {
          throw StateError('Branch ID is missing');
        }

        await ApiClient.instance.patch(
          '/branches/$branchId',
          data: payload,
        );
      } else {
        await ApiClient.instance.post(
          '/branches',
          data: payload,
        );
      }

      if (!mounted) return;

      Navigator.pop(context, true);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isEditing
                ? 'Branch updated successfully.'
                : 'Branch created successfully.',
          ),
        ),
      );
    } on DioException catch (e) {
      if (!mounted) return;

      final message = e.response?.data?['message']?.toString() ??
          (_isEditing
              ? 'Failed to update branch.'
              : 'Failed to create branch.');

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } catch (_) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isEditing
                ? 'Failed to update branch.'
                : 'Failed to create branch.',
          ),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        16,
        16,
        MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _isEditing ? 'Edit Branch' : 'Add Branch',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),
              AppTextField(
                controller: _nameController,
                label: 'Branch Name',
                prefixIcon: Icons.store_outlined,
                validator: (value) {
                  final text = value?.trim() ?? '';

                  if (text.isEmpty) {
                    return 'Branch name is required';
                  }

                  if (text.length > 255) {
                    return 'Branch name is too long';
                  }

                  return null;
                },
              ),
              const SizedBox(height: 14),
              AppTextField(
                controller: _locationController,
                label: 'Location',
                prefixIcon: Icons.location_on_outlined,
              ),
              const SizedBox(height: 14),
              AppTextField(
                controller: _phoneController,
                label: 'Phone Number',
                keyboardType: TextInputType.phone,
                prefixIcon: Icons.phone_outlined,
                validator: (value) {
                  if ((value?.trim().length ?? 0) > 20) {
                    return 'Phone number is too long';
                  }

                  return null;
                },
              ),
              if (_isEditing) ...[
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: _status,
                  decoration: InputDecoration(
                    labelText: 'Status',
                    prefixIcon: const Icon(Icons.toggle_on_outlined),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'active',
                      child: Text('Active'),
                    ),
                    DropdownMenuItem(
                      value: 'pending',
                      child: Text('Pending'),
                    ),
                    DropdownMenuItem(
                      value: 'suspended',
                      child: Text('Suspended'),
                    ),
                    DropdownMenuItem(
                      value: 'deactivated',
                      child: Text('Deactivated'),
                    ),
                  ],
                  onChanged: _saving
                      ? null
                      : (value) {
                          if (value != null) {
                            setState(() => _status = value);
                          }
                        },
                ),
              ],
              const SizedBox(height: 22),
              AppButton(
                label: _isEditing ? 'Save Changes' : 'Create Branch',
                onPressed: _submit,
                isLoading: _saving,
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _locationController.dispose();
    _phoneController.dispose();
    super.dispose();
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;

  const _DetailRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Text(
            label,
            style: TextStyle(
              color: context.appSecondaryText,
              fontSize: 12,
            ),
          ),
          const Spacer(),
          Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}
