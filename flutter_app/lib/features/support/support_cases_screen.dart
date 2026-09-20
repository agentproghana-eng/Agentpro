import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';

class SupportCasesScreen extends StatefulWidget {
  const SupportCasesScreen({super.key});

  @override
  State<SupportCasesScreen> createState() =>
      _SupportCasesScreenState();
}

class _SupportCasesScreenState extends State<SupportCasesScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _cases = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  String _errorMessage(Object error) {
    if (error is DioException) {
      final body = error.response?.data;
      if (body is Map) {
        final message = body['message']?.toString().trim();
        if (message != null && message.isNotEmpty) return message;
      }
    }

    return 'Support cases could not be loaded. Please try again.';
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final response = await ApiClient.instance.get('/support/cases');
      final payload = response.data;
      final next = <Map<String, dynamic>>[];

      if (payload is Map && payload['data'] is Map) {
        final data = payload['data'] as Map;
        final rawCases = data['cases'];

        if (rawCases is List) {
          for (final raw in rawCases) {
            if (raw is Map) {
              next.add(Map<String, dynamic>.from(raw));
            }
          }
        }
      }

      if (!mounted) return;

      setState(() {
        _cases = next;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _loading = false;
        _error = _errorMessage(error);
      });
    }
  }

  String _dateLabel(dynamic value) {
    final parsed = DateTime.tryParse(value?.toString() ?? '');
    if (parsed == null) return '—';

    final local = parsed.toLocal();
    final day = local.day.toString().padLeft(2, '0');
    final month = local.month.toString().padLeft(2, '0');
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');

    return '$day/$month/${local.year} $hour:$minute';
  }

  String _statusLabel(dynamic value) => switch (value?.toString()) {
        'in_progress' => 'In progress',
        'resolved' => 'Resolved',
        'closed' => 'Closed',
        _ => 'Open',
      };

  Color _statusColor(dynamic value) => switch (value?.toString()) {
        'in_progress' => Colors.orange,
        'resolved' => Colors.green,
        'closed' => Colors.grey,
        _ => AppTheme.primaryColor,
      };

  Future<void> _openCase(Map<String, dynamic> item) async {
    final id = item['id']?.toString();
    if (id == null || id.isEmpty) return;

    var loadingDialogOpen = true;

    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const PopScope(
        canPop: false,
        child: Center(
          child: CircularProgressIndicator(),
        ),
      ),
    );

    try {
      final response = await ApiClient.instance.get('/support/cases/$id');

      if (!mounted) return;

      final payload = response.data;
      Map<String, dynamic>? supportCase;
      final messages = <Map<String, dynamic>>[];

      if (payload is Map && payload['data'] is Map) {
        final data = payload['data'] as Map;

        if (data['case'] is Map) {
          supportCase = Map<String, dynamic>.from(data['case'] as Map);
        }

        if (data['messages'] is List) {
          for (final raw in data['messages'] as List) {
            if (raw is Map) {
              messages.add(Map<String, dynamic>.from(raw));
            }
          }
        }
      }

      if (supportCase == null) {
        throw StateError('Support case unavailable');
      }

      if (!mounted) return;

      if (loadingDialogOpen) {
        Navigator.of(context, rootNavigator: true).pop();
        loadingDialogOpen = false;
      }

      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => FractionallySizedBox(
          heightFactor: 0.9,
          child: _SupportCaseDetail(
            supportCase: supportCase!,
            messages: messages,
            dateLabel: _dateLabel,
            statusLabel: _statusLabel,
            statusColor: _statusColor,
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;

      if (loadingDialogOpen) {
        Navigator.of(context, rootNavigator: true).pop();
        loadingDialogOpen = false;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_errorMessage(error))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget content;

    if (_loading) {
      content = const ListView(
        children: [
          SizedBox(height: 160),
          Center(child: CircularProgressIndicator()),
        ],
      );
    } else if (_error != null) {
      content = ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 80),
          const Icon(Icons.error_outline, size: 42),
          const SizedBox(height: 12),
          Text(_error!, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _load,
            child: const Text('Try Again'),
          ),
        ],
      );
    } else if (_cases.isEmpty) {
      content = ListView(
        padding: const EdgeInsets.all(24),
        children: const [
          SizedBox(height: 80),
          Icon(Icons.inbox_outlined, size: 48),
          SizedBox(height: 12),
          Text(
            'No support cases yet.',
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          SizedBox(height: 6),
          Text(
            'Complaints, feedback and suggestions you send to AgentPro Support will appear here.',
            textAlign: TextAlign.center,
          ),
        ],
      );
    } else {
      content = ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _cases.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final item = _cases[index];
          final latestReply = item['latest_reply']?.toString().trim();

          return InkWell(
            onTap: () => _openCase(item),
            borderRadius: BorderRadius.circular(14),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: Colors.grey.withValues(alpha: 0.2),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item['reference']?.toString() ?? 'Support case',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: AppTheme.primaryColor,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 9,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: _statusColor(item['status'])
                              .withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          _statusLabel(item['status']),
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: _statusColor(item['status']),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    item['subject']?.toString() ?? '—',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '${item['type'] ?? 'feedback'} · ${_dateLabel(item['created_at'])}',
                    style: TextStyle(
                      fontSize: 11.5,
                      color: Colors.grey.shade600,
                    ),
                  ),
                  if (latestReply != null && latestReply.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(
                      'Latest reply: $latestReply',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('My Support Cases')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: content,
      ),
    );
  }
}

class _SupportCaseDetail extends StatelessWidget {
  final Map<String, dynamic> supportCase;
  final List<Map<String, dynamic>> messages;
  final String Function(dynamic) dateLabel;
  final String Function(dynamic) statusLabel;
  final Color Function(dynamic) statusColor;

  const _SupportCaseDetail({
    required this.supportCase,
    required this.messages,
    required this.dateLabel,
    required this.statusLabel,
    required this.statusColor,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 10, 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      supportCase['reference']?.toString() ?? 'Support case',
                      style: const TextStyle(
                        color: AppTheme.primaryColor,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      supportCase['subject']?.toString() ?? '—',
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Close',
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: statusColor(supportCase['status'])
                          .withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      statusLabel(supportCase['status']),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: statusColor(supportCase['status']),
                      ),
                    ),
                  ),
                  Text(
                    dateLabel(supportCase['created_at']),
                    style: const TextStyle(fontSize: 12),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Text(
                'Your message',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              Text(supportCase['initial_message']?.toString() ?? '—'),
              if (messages.isNotEmpty) ...[
                const SizedBox(height: 22),
                const Text(
                  'AgentPro Support replies',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                for (final message in messages) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: message['author_role'] == 'admin'
                          ? AppTheme.primaryColor.withValues(alpha: 0.07)
                          : Colors.grey.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          message['author_role'] == 'admin'
                              ? 'AgentPro Support'
                              : 'You',
                          style: const TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(message['body']?.toString() ?? '—'),
                        const SizedBox(height: 6),
                        Text(
                          dateLabel(message['created_at']),
                          style: TextStyle(
                            fontSize: 10.5,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ],
            ],
          ),
        ),
      ],
    );
  }
}
