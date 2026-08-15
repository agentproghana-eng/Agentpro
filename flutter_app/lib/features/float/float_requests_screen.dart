import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class FloatRequestsScreen extends StatefulWidget {
  const FloatRequestsScreen({super.key});

  @override
  State<FloatRequestsScreen> createState() => _FloatRequestsScreenState();
}

class _FloatRequestsScreenState extends State<FloatRequestsScreen> {
  List<dynamic> _requests = [];

  String? _statusFilter;

  int _page = 1;
  int _totalPages = 1;

  bool _loading = true;
  bool _loadingMore = false;
  String? _error;

  String? get _role {
    final state = context.read<AuthBloc>().state;

    if (state is! AuthAuthenticated) {
      return null;
    }

    return state.user['role']?.toString();
  }

  bool get _isAgent => _role == 'agent';

  bool get _canReview => _role == 'business_owner' || _role == 'manager';

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _load();
      }
    });
  }

  Future<void> _load({bool loadMore = false}) async {
    if (loadMore) {
      if (_loadingMore || _page >= _totalPages) {
        return;
      }

      setState(() {
        _loadingMore = true;
      });
    } else {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    final nextPage = loadMore ? _page + 1 : 1;

    try {
      final queryParameters = <String, dynamic>{'page': nextPage, 'limit': 30};

      if (_statusFilter != null) {
        queryParameters['status'] = _statusFilter;
      }

      final res = await ApiClient.instance.get(
        '/float/requests',
        queryParameters: queryParameters,
      );

      if (!mounted) {
        return;
      }

      final data = List<dynamic>.from(res.data['data'] ?? const []);

      final meta = res.data['meta'];

      setState(() {
        _requests = loadMore ? [..._requests, ...data] : data;

        _page = (meta?['page'] as num?)?.toInt() ?? nextPage;

        _totalPages = (meta?['total_pages'] as num?)?.toInt() ?? 1;

        _loading = false;
        _loadingMore = false;
      });
    } on DioException catch (error) {
      if (!mounted) {
        return;
      }

      final responseData = error.response?.data;

      final message =
          responseData is Map ? responseData['message']?.toString() : null;

      setState(() {
        _error = message ?? 'Failed to load float requests';
        _loading = false;
        _loadingMore = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = 'Failed to load float requests';
        _loading = false;
        _loadingMore = false;
      });
    }
  }

  Future<void> _openNewRequest() async {
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _SubmitFloatRequestSheet(),
    );

    if (submitted == true && mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Float request submitted')));

      await _load();
    }
  }

  Future<void> _review(Map<String, dynamic> request, String status) async {
    final requestId = request['id']?.toString();

    if (requestId == null || requestId.isEmpty) {
      return;
    }

    final isApprove = status == 'approved';

    final notesController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(
            isApprove ? 'Approve Float Request' : 'Reject Float Request',
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${request['requested_by_name']?.toString() ?? 'Agent'} · '
                  '${request['branch_name']?.toString() ?? 'Branch'}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                GhsAmount(
                  amount: double.tryParse(
                        request['amount_requested']?.toString() ?? '0',
                      ) ??
                      0,
                  fontSize: 20,
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.appTileColor(const Color(0xFFFFF4D9)),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    isApprove
                        ? 'Approval records that this request is accepted. It does not add money to branch treasury. Use Top Up Branch Float separately when the treasury is actually funded.'
                        : 'Rejecting this request records the decision only. No branch treasury balance is changed.',
                    style: TextStyle(
                      color: context.appSecondaryText,
                      fontSize: 11,
                      height: 1.35,
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: notesController,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Review note (optional)',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              style: isApprove
                  ? null
                  : ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.errorColor,
                      foregroundColor: Colors.white,
                    ),
              child: Text(isApprove ? 'Approve Request' : 'Reject Request'),
            ),
          ],
        );
      },
    );

    if (confirmed != true || !mounted) {
      notesController.dispose();
      return;
    }

    final reviewNotes = notesController.text.trim();

    notesController.dispose();

    try {
      await ApiClient.instance.patch(
        '/float/request/$requestId/review',
        data: {
          'status': status,
          'review_notes': reviewNotes.isEmpty ? null : reviewNotes,
        },
      );

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isApprove ? 'Float request approved' : 'Float request rejected',
          ),
        ),
      );

      await _load();
    } on DioException catch (error) {
      if (!mounted) {
        return;
      }

      final responseData = error.response?.data;

      final message =
          responseData is Map ? responseData['message']?.toString() : null;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message ?? 'Failed to review float request'),
          backgroundColor: AppTheme.errorColor,
        ),
      );

      if (error.response?.statusCode == 409 ||
          error.response?.statusCode == 404) {
        await _load();
      }
    } catch (_) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to review float request'),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    }
  }

  void _setStatus(String? status) {
    if (_statusFilter == status) {
      return;
    }

    setState(() {
      _statusFilter = status;
    });

    _load();
  }

  @override
  Widget build(BuildContext context) {
    final isAgent = _isAgent;
    final canReview = _canReview;

    return Scaffold(
      appBar: AppBar(
        title: Text(isAgent ? 'My Float Requests' : 'Float Requests'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  ChoiceChip(
                    label: const Text('All'),
                    selected: _statusFilter == null,
                    onSelected: (_) => _setStatus(null),
                  ),
                  const SizedBox(width: 8),
                  ChoiceChip(
                    label: const Text('Pending'),
                    selected: _statusFilter == 'pending',
                    onSelected: (_) => _setStatus('pending'),
                  ),
                  const SizedBox(width: 8),
                  ChoiceChip(
                    label: const Text('Approved'),
                    selected: _statusFilter == 'approved',
                    onSelected: (_) => _setStatus('approved'),
                  ),
                  const SizedBox(width: 8),
                  ChoiceChip(
                    label: const Text('Rejected'),
                    selected: _statusFilter == 'rejected',
                    onSelected: (_) => _setStatus('rejected'),
                  ),
                ],
              ),
            ),
          ),
          if (canReview)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: context.appTileColor(const Color(0xFFE6F4F1)),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  'Approving a request does not credit branch treasury. Use Top Up Branch Float separately when funds are actually added.',
                  style: TextStyle(
                    color: context.appSecondaryText,
                    fontSize: 11,
                    height: 1.35,
                  ),
                ),
              ),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? EmptyState(
                        icon: Icons.error_outline,
                        title: 'Could not load float requests',
                        subtitle: _error,
                        actionLabel: 'Retry',
                        onAction: _load,
                      )
                    : _requests.isEmpty
                        ? RefreshIndicator(
                            onRefresh: _load,
                            child: ListView(
                              physics: const AlwaysScrollableScrollPhysics(),
                              children: [
                                SizedBox(
                                  height:
                                      MediaQuery.sizeOf(context).height * 0.48,
                                  child: EmptyState(
                                    icon: Icons.request_page_outlined,
                                    title: isAgent
                                        ? 'No float requests yet'
                                        : 'No float requests found',
                                    subtitle: isAgent
                                        ? 'Request branch treasury float when your branch needs additional funding.'
                                        : 'Requests matching this status will appear here.',
                                  ),
                                ),
                              ],
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.builder(
                              physics: const AlwaysScrollableScrollPhysics(),
                              padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
                              itemCount: _requests.length +
                                  (_page < _totalPages ? 1 : 0),
                              itemBuilder: (context, index) {
                                if (index == _requests.length) {
                                  return Padding(
                                    padding: const EdgeInsets.symmetric(
                                        vertical: 12),
                                    child: Center(
                                      child: _loadingMore
                                          ? const CircularProgressIndicator()
                                          : TextButton(
                                              onPressed: () =>
                                                  _load(loadMore: true),
                                              child: const Text('Load More'),
                                            ),
                                    ),
                                  );
                                }

                                final request = Map<String, dynamic>.from(
                                  _requests[index] as Map,
                                );

                                return _FloatRequestCard(
                                  request: request,
                                  showRequester: !isAgent,
                                  canReview: canReview &&
                                      request['status']?.toString() ==
                                          'pending',
                                  onApprove: () => _review(request, 'approved'),
                                  onReject: () => _review(request, 'rejected'),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
      floatingActionButton: isAgent
          ? FloatingActionButton.extended(
              onPressed: _openNewRequest,
              icon: const Icon(Icons.add),
              label: const Text('Request Float'),
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: Colors.white,
            )
          : null,
    );
  }
}

class _FloatRequestCard extends StatelessWidget {
  final Map<String, dynamic> request;
  final bool showRequester;
  final bool canReview;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  const _FloatRequestCard({
    required this.request,
    required this.showRequester,
    required this.canReview,
    required this.onApprove,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    final provider = request['provider']?.toString() ?? '';

    final status = request['status']?.toString() ?? 'pending';

    final amount =
        double.tryParse(request['amount_requested']?.toString() ?? '0') ?? 0;

    final reason = request['reason']?.toString().trim();

    final reviewNotes = request['review_notes']?.toString().trim();

    final reviewer = request['reviewed_by_name']?.toString().trim();

    final createdAt = DateTime.tryParse(
      request['created_at']?.toString() ?? '',
    );

    final reviewedAt = DateTime.tryParse(
      request['reviewed_at']?.toString() ?? '',
    );

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ProviderBadge(provider: provider),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        request['branch_name']?.toString() ?? 'Branch',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      if (showRequester)
                        Text(
                          request['requested_by_name']?.toString() ?? 'Agent',
                          style: TextStyle(
                            color: context.appSecondaryText,
                            fontSize: 11,
                          ),
                        ),
                    ],
                  ),
                ),
                _StatusBadge(status: status),
              ],
            ),
            const SizedBox(height: 12),
            GhsAmount(amount: amount, fontSize: 20),
            if (reason != null && reason.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                reason,
                style: TextStyle(
                  color: context.appSecondaryText,
                  fontSize: 12,
                  height: 1.35,
                ),
              ),
            ],
            const SizedBox(height: 10),
            Text(
              'Requested ${_dateTimeLabel(createdAt)}',
              style: TextStyle(color: context.appSecondaryText, fontSize: 10),
            ),
            if (status != 'pending') ...[
              const SizedBox(height: 8),
              Divider(color: context.appDivider),
              Text(
                reviewer != null && reviewer.isNotEmpty
                    ? '${_statusTitle(status)} by $reviewer'
                    : _statusTitle(status),
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (reviewedAt != null)
                Text(
                  _dateTimeLabel(reviewedAt),
                  style: TextStyle(
                    color: context.appSecondaryText,
                    fontSize: 10,
                  ),
                ),
              if (reviewNotes != null && reviewNotes.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  reviewNotes,
                  style: TextStyle(
                    color: context.appSecondaryText,
                    fontSize: 11,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ],
            ],
            if (canReview) ...[
              const SizedBox(height: 12),
              Divider(color: context.appDivider),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: onReject,
                      child: const Text('Reject'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: onApprove,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryColor,
                        foregroundColor: Colors.white,
                      ),
                      child: const Text('Approve'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;

  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, background, foreground) = switch (status) {
      'approved' => (
          'APPROVED',
          context.isDarkMode
              ? const Color(0xFF1B3327)
              : const Color(0xFFE1F5E9),
          context.isDarkMode
              ? const Color(0xFF69D28A)
              : const Color(0xFF1B7A43),
        ),
      'rejected' => (
          'REJECTED',
          context.isDarkMode
              ? const Color(0xFF332020)
              : const Color(0xFFFBE4E4),
          context.isDarkMode
              ? const Color(0xFFE57373)
              : const Color(0xFFA33333),
        ),
      _ => (
          'PENDING',
          context.isDarkMode
              ? const Color(0xFF332B15)
              : const Color(0xFFFFF4D9),
          context.isDarkMode
              ? AppTheme.secondaryColor
              : const Color(0xFF7A5B00),
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: foreground,
          fontSize: 9,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}

class _SubmitFloatRequestSheet extends StatefulWidget {
  const _SubmitFloatRequestSheet();

  @override
  State<_SubmitFloatRequestSheet> createState() =>
      _SubmitFloatRequestSheetState();
}

class _SubmitFloatRequestSheetState extends State<_SubmitFloatRequestSheet> {
  final _amountController = TextEditingController();

  final _reasonController = TextEditingController();

  List<dynamic> _branches = [];

  String? _branchId;
  String _provider = 'mtn';

  bool _loadingBranches = true;
  bool _submitting = false;

  String? _error;

  @override
  void initState() {
    super.initState();
    _loadBranches();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _loadBranches() async {
    try {
      final res = await ApiClient.instance.get('/branches');

      if (!mounted) {
        return;
      }

      final branches = List<dynamic>.from(res.data['data'] ?? const []);

      setState(() {
        _branches = branches;

        _branchId =
            branches.isNotEmpty ? branches.first['id']?.toString() : null;

        _loadingBranches = false;
      });
    } on DioException catch (error) {
      if (!mounted) {
        return;
      }

      final responseData = error.response?.data;

      final message =
          responseData is Map ? responseData['message']?.toString() : null;

      setState(() {
        _loadingBranches = false;
        _error = message ?? 'Could not load your assigned branches.';
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loadingBranches = false;
        _error = 'Could not load your assigned branches.';
      });
    }
  }

  Future<void> _submit() async {
    final amount = double.tryParse(
      _amountController.text.replaceAll(',', '').trim(),
    );

    if (_branchId == null) {
      setState(() {
        _error = 'Select an assigned branch.';
      });
      return;
    }

    if (amount == null || amount <= 0) {
      setState(() {
        _error = 'Enter a valid amount greater than zero.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final reason = _reasonController.text.trim();

      await ApiClient.instance.post(
        '/float/request',
        data: {
          'branch_id': _branchId,
          'provider': _provider,
          'amount_requested': amount,
          'reason': reason.isEmpty ? null : reason,
        },
      );

      if (!mounted) {
        return;
      }

      Navigator.pop(context, true);
    } on DioException catch (error) {
      if (!mounted) {
        return;
      }

      final responseData = error.response?.data;

      final message =
          responseData is Map ? responseData['message']?.toString() : null;

      setState(() {
        _error = message ?? 'Failed to submit float request.';
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = 'Failed to submit float request.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          16,
          16,
          MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Request Branch Float',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(
                'Send a branch treasury funding request to your manager or business owner. This does not change your personal SIM-wallet balance.',
                style: TextStyle(
                  color: context.appSecondaryText,
                  fontSize: 11,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 16),
              if (_loadingBranches)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_branches.isEmpty)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.appTileColor(const Color(0xFFFFF4D9)),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Text(
                    'You are not assigned to any active branch. A branch assignment is required before requesting branch float.',
                  ),
                )
              else
                DropdownButtonFormField<String>(
                  initialValue: _branchId,
                  decoration: const InputDecoration(
                    labelText: 'Assigned branch',
                    border: OutlineInputBorder(),
                  ),
                  items: _branches
                      .map(
                        (branch) => DropdownMenuItem<String>(
                          value: branch['id']?.toString(),
                          child: Text(branch['name']?.toString() ?? 'Branch'),
                        ),
                      )
                      .toList(),
                  onChanged: _submitting
                      ? null
                      : (value) {
                          setState(() {
                            _branchId = value;
                            _error = null;
                          });
                        },
                ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _provider,
                decoration: const InputDecoration(
                  labelText: 'Provider',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'mtn',
                    child: Text('MTN Mobile Money'),
                  ),
                  DropdownMenuItem(
                    value: 'telecel',
                    child: Text('Telecel Cash'),
                  ),
                  DropdownMenuItem(value: 'at_money', child: Text('AT Money')),
                ],
                onChanged: _submitting
                    ? null
                    : (value) {
                        if (value == null) {
                          return;
                        }

                        setState(() {
                          _provider = value;
                          _error = null;
                        });
                      },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _amountController,
                enabled: !_submitting,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Requested amount',
                  prefixText: 'GH₵ ',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _reasonController,
                enabled: !_submitting,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Reason (optional)',
                  hintText: 'e.g. branch MTN treasury is running low',
                  border: OutlineInputBorder(),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
              const SizedBox(height: 20),
              AppButton(
                label: 'Submit Float Request',
                onPressed:
                    _loadingBranches || _branches.isEmpty ? null : _submit,
                isLoading: _submitting,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _statusTitle(String status) {
  return switch (status) {
    'approved' => 'Approved',
    'rejected' => 'Rejected',
    _ => 'Pending',
  };
}

String _dateTimeLabel(DateTime? value) {
  if (value == null) {
    return '—';
  }

  final local = value.toLocal();

  final month = local.month.toString().padLeft(2, '0');

  final day = local.day.toString().padLeft(2, '0');

  final hour = local.hour.toString().padLeft(2, '0');

  final minute = local.minute.toString().padLeft(2, '0');

  return '${local.year}-$month-$day $hour:$minute';
}
