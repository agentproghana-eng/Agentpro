import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';
import 'staff_work_history_screen.dart';

class StaffManagementScreen extends StatefulWidget {
  const StaffManagementScreen({super.key});

  @override
  State<StaffManagementScreen> createState() => _StaffManagementScreenState();
}

class _StaffManagementScreenState extends State<StaffManagementScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<dynamic> _staff = [];
  List<dynamic> _branches = [];
  bool _loading = true;
  String? _error;

  static const _roles = ['manager', 'agent', 'auditor'];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: _roles.length + 1, vsync: this); // +1 for "All"
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        ApiClient.instance.get('/users', queryParameters: {'limit': 100}),
        ApiClient.instance.get('/branches'),
      ]);
      if (mounted) {
        setState(() {
          _staff = results[0].data['data'] ?? [];
          _branches = results[1].data['data'] ?? [];
          _loading = false;
        });
      }
    } on DioException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.response?.data?['message'] ?? 'Failed to load staff';
          _loading = false;
        });
      }
    }
  }

  List<dynamic> _filteredStaff(String? role) {
    // Staff list already excludes the owner themself server-side scoping by company,
    // but the owner record itself may appear since /users returns all company roles.
    final base = _staff.where((u) => u['role'] != 'business_owner' && u['status'] != 'deactivated').toList();
    if (role == null) return base;
    return base.where((u) => u['role'] == role).toList();
  }

  Future<void> _toggleStatus(Map<String, dynamic> user) async {
    final newStatus = user['status'] == 'active' ? 'suspended' : 'active';
    try {
      await ApiClient.instance.patch('/users/${user['id']}', data: {'status': newStatus});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${user['first_name']} ${newStatus == 'active' ? 'activated' : 'suspended'}')),
        );
      }
      _load();
    } on DioException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.response?.data?['message'] ?? 'Action failed'),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    }
  }

  Future<void> _deactivateStaff(Map<String, dynamic> user) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Delete Staff Member"),
        content: Text(
          "Remove ${user['first_name']} ${user['last_name']} from your company? "
          "Their transaction history will be preserved, but they will no longer be able to log in."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("Cancel")),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text("Delete", style: TextStyle(color: AppTheme.errorColor)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await ApiClient.instance.patch("/users/${user['id']}", data: {"status": "deactivated"});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("${user['first_name']} removed")),
        );
      }
      _load();
    } on DioException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.response?.data?["message"] ?? "Action failed"),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    }
  }

  Future<void> _reassignBranch(Map<String, dynamic> user) async {
    String? selectedBranchId = user["branch_id"];
    final confirmed = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text("Reassign ${user["first_name"]} ${user["last_name"]}"),
          content: DropdownButtonFormField<String>(
            value: selectedBranchId,
            items: _branches.map<DropdownMenuItem<String>>((b) => DropdownMenuItem(
              value: b["id"] as String,
              child: Text(b["name"] ?? ""),
            )).toList(),
            onChanged: (v) => setDialogState(() => selectedBranchId = v),
            decoration: const InputDecoration(labelText: "Branch"),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Cancel")),
            TextButton(onPressed: () => Navigator.pop(ctx, selectedBranchId), child: const Text("Reassign")),
          ],
        ),
      ),
    );
    if (confirmed == null) return;
    try {
      await ApiClient.instance.patch("/users/${user["id"]}/reassign-branch", data: {"branch_id": confirmed});
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Branch reassigned")));
      _load();
    } on DioException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.response?.data?["message"] ?? "Failed to reassign"), backgroundColor: AppTheme.errorColor));
    }
  }

  void _showAddStaffSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _AddStaffSheet(branches: _branches, onCreated: _load),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Managers can view this screen (server-side scoping already restricts
    // them to agents in branches they manage) but cannot create, suspend,
    // delete, or reassign - those routes are owner/superuser only. Rather
    // than show controls that silently fail with a 403, hide them entirely.
    final role = (context.read<AuthBloc>().state as AuthAuthenticated).user['role'];
    final isReadOnly = role == 'manager';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Manage Staff'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white,
          tabs: const [
            Tab(text: 'All'),
            Tab(text: 'Managers'),
            Tab(text: 'Agents'),
            Tab(text: 'Auditors'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? EmptyState(
                  icon: Icons.error_outline,
                  title: 'Could not load staff',
                  subtitle: _error,
                  actionLabel: 'Retry',
                  onAction: _load,
                )
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _StaffList(staff: _filteredStaff(null), onToggle: _toggleStatus, onDelete: _deactivateStaff, onReassign: _reassignBranch, onRefresh: _load, isReadOnly: isReadOnly),
                    _StaffList(staff: _filteredStaff('manager'), onToggle: _toggleStatus, onDelete: _deactivateStaff, onReassign: _reassignBranch, onRefresh: _load, isReadOnly: isReadOnly),
                    _StaffList(staff: _filteredStaff('agent'), onToggle: _toggleStatus, onDelete: _deactivateStaff, onReassign: _reassignBranch, onRefresh: _load, isReadOnly: isReadOnly),
                    _StaffList(staff: _filteredStaff('auditor'), onToggle: _toggleStatus, onDelete: _deactivateStaff, onReassign: _reassignBranch, onRefresh: _load, isReadOnly: isReadOnly),
                  ],
                ),
      floatingActionButton: isReadOnly
          ? null
          : FloatingActionButton.extended(
              onPressed: _showAddStaffSheet,
              icon: const Icon(Icons.person_add),
              label: const Text('Add Staff'),
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: AppTheme.secondaryColor,
            ),
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }
}

// ── Staff List ────────────────────────────────────────────────

class _StaffList extends StatelessWidget {
  final List<dynamic> staff;
  final void Function(Map<String, dynamic>) onToggle;
  final void Function(Map<String, dynamic>) onDelete;
  final void Function(Map<String, dynamic>) onReassign;
  final Future<void> Function() onRefresh;
  final bool isReadOnly;

  const _StaffList({required this.staff, required this.onToggle, required this.onDelete, required this.onReassign, required this.onRefresh, this.isReadOnly = false});

  @override
  Widget build(BuildContext context) {
    if (staff.isEmpty) {
      return const EmptyState(
        icon: Icons.people_outline,
        title: 'No staff in this category',
        subtitle: 'Tap "Add Staff" to create one',
      );
    }

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.builder(
        padding: const EdgeInsets.all(8),
        itemCount: staff.length,
        itemBuilder: (_, i) {
          final u = staff[i] as Map<String, dynamic>;
          final isActive = u['status'] == 'active';
          return Card(
            margin: const EdgeInsets.only(bottom: 6),
            child: ListTile(
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => StaffWorkHistoryScreen(
                    userId: u["id"],
                    userName: "${u['first_name']} ${u['last_name']}",
                  ),
                ),
              ),
              leading: CircleAvatar(
                backgroundColor: AppTheme.primaryColor.withOpacity(0.1),
                child: Text(
                  ((u['first_name'] as String?) ?? '?')[0].toUpperCase(),
                  style: const TextStyle(color: AppTheme.primaryColor, fontWeight: FontWeight.bold),
                ),
              ),
              title: Text('${u['first_name']} ${u['last_name']}',
                style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(u['phone'] ?? u['email'] ?? '', style: const TextStyle(fontSize: 12)),
                  Text((u['role'] ?? '').toString().toUpperCase(),
                    style: TextStyle(fontSize: 10, color: Colors.grey[500], letterSpacing: 0.5)),
                ],
              ),
              isThreeLine: true,
              trailing: isReadOnly
                  ? StatusBadge(status: u['status'] ?? '')
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        StatusBadge(status: u['status'] ?? ''),
                        const SizedBox(width: 4),
                        PopupMenuButton<String>(
                          icon: const Icon(Icons.more_vert, size: 20),
                          onSelected: (value) {
                            if (value == "toggle") onToggle(u);
                            if (value == "delete") onDelete(u);
                            if (value == "reassign") onReassign(u);
                          },
                          itemBuilder: (_) => [
                            PopupMenuItem(
                              value: "toggle",
                              child: Text(isActive ? "Suspend" : "Activate"),
                            ),
                            PopupMenuItem(
                              value: "delete",
                              child: Text("Delete", style: TextStyle(color: AppTheme.errorColor)),
                            ),
                            PopupMenuItem(
                              value: "reassign",
                              child: Text("Reassign Branch"),
                            ),
                          ],
                        ),
                      ],
                    ),
            ),
          );
        },
      ),
    );
  }
}

// ── Add Staff Bottom Sheet ───────────────────────────────────

class _AddStaffSheet extends StatefulWidget {
  final List<dynamic> branches;
  final VoidCallback onCreated;

  const _AddStaffSheet({required this.branches, required this.onCreated});

  @override
  State<_AddStaffSheet> createState() => _AddStaffSheetState();
}

class _AddStaffSheetState extends State<_AddStaffSheet> {
  final _formKey = GlobalKey<FormState>();
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  String _role = 'agent';
  String? _branchId;
  bool _loading = false;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_role != 'auditor' && _branchId == null && widget.branches.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a branch')));
      return;
    }

    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.post('/users', data: {
        'first_name': _firstNameCtrl.text.trim(),
        'last_name': _lastNameCtrl.text.trim(),
        'email': _emailCtrl.text.trim(),
        'phone': _phoneCtrl.text.trim(),
        'role': _role,
        if (_branchId != null) 'branch_id': _branchId,
      });

      if (mounted) {
        Navigator.pop(context);
        widget.onCreated();
        final message = res.data['message'] as String? ?? 'Staff account created.';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(message)),
        );
      }
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? 'Failed to create staff account';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Add Staff Member', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),

              const Text('Role', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: ['manager', 'agent', 'auditor'].map((r) {
                  final selected = _role == r;
                  return ChoiceChip(
                    label: Text(r[0].toUpperCase() + r.substring(1)),
                    selected: selected,
                    onSelected: (_) => setState(() => _role = r),
                    selectedColor: AppTheme.primaryColor.withOpacity(0.15),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),

              Row(children: [
                Expanded(
                  child: AppTextField(
                    controller: _firstNameCtrl,
                    label: 'First Name',
                    validator: (v) => v!.isEmpty ? 'Required' : null,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: AppTextField(
                    controller: _lastNameCtrl,
                    label: 'Last Name',
                    validator: (v) => v!.isEmpty ? 'Required' : null,
                  ),
                ),
              ]),
              const SizedBox(height: 14),

              AppTextField(
                controller: _emailCtrl,
                label: 'Email Address',
                keyboardType: TextInputType.emailAddress,
                prefixIcon: Icons.email_outlined,
                validator: (v) => !v!.contains('@') ? 'Enter a valid email' : null,
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

              if (_role != 'auditor' && widget.branches.isNotEmpty) ...[
                DropdownButtonFormField<String>(
                  value: _branchId,
                  decoration: InputDecoration(
                    labelText: 'Assign to Branch',
                    prefixIcon: const Icon(Icons.store_outlined),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  items: widget.branches.map<DropdownMenuItem<String>>((b) => DropdownMenuItem(
                    value: b['id'] as String,
                    child: Text(b['name'] as String),
                  )).toList(),
                  onChanged: (v) => setState(() => _branchId = v),
                ),
                const SizedBox(height: 8),
              ],

              const SizedBox(height: 8),
              AppButton(label: 'Create Account', onPressed: _submit, isLoading: _loading),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    for (final c in [_firstNameCtrl, _lastNameCtrl, _emailCtrl, _phoneCtrl]) {
      c.dispose();
    }
    super.dispose();
  }
}
