import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';

class FloatHistoryScreen extends StatefulWidget {
  final String? branchId;

  const FloatHistoryScreen({super.key, this.branchId});

  @override
  State<FloatHistoryScreen> createState() => _FloatHistoryScreenState();
}

class _FloatHistoryScreenState extends State<FloatHistoryScreen> {
  List<dynamic> _movements = [];

  String? _provider;
  DateTimeRange? _dateRange;

  int _page = 1;
  int _totalPages = 1;

  bool _loading = true;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
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

      final branchId = widget.branchId;
      if (branchId != null && branchId.isNotEmpty) {
        queryParameters['branch_id'] = branchId;
      }

      if (_provider != null) {
        queryParameters['provider'] = _provider;
      }

      if (_dateRange != null) {
        final start = DateTime(
          _dateRange!.start.year,
          _dateRange!.start.month,
          _dateRange!.start.day,
        );

        final end = DateTime(
          _dateRange!.end.year,
          _dateRange!.end.month,
          _dateRange!.end.day,
          23,
          59,
          59,
          999,
        );

        queryParameters['from_date'] = start.toUtc().toIso8601String();
        queryParameters['to_date'] = end.toUtc().toIso8601String();
      }

      final res = await ApiClient.instance.get(
        '/float/history',
        queryParameters: queryParameters,
      );

      if (!mounted) {
        return;
      }

      final data = List<dynamic>.from(res.data['data'] ?? const []);

      final meta = res.data['meta'];

      setState(() {
        _movements = loadMore ? [..._movements, ...data] : data;

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
        _error = message ?? 'Failed to load float history';
        _loading = false;
        _loadingMore = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = 'Failed to load float history';
        _loading = false;
        _loadingMore = false;
      });
    }
  }

  Future<void> _showFilters() async {
    String? tempProvider = _provider;
    DateTimeRange? tempDateRange = _dateRange;

    final applied = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            Future<void> chooseDates() async {
              final now = DateTime.now();

              final selected = await showDateRangePicker(
                context: context,
                firstDate: DateTime(2020),
                lastDate: DateTime(now.year + 1, 12, 31),
                initialDateRange: tempDateRange,
              );

              if (selected != null) {
                setSheetState(() {
                  tempDateRange = selected;
                });
              }
            }

            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Filter Float History',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Provider',
                      style: TextStyle(
                        color: context.appSecondaryText,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ChoiceChip(
                          label: const Text('All'),
                          selected: tempProvider == null,
                          onSelected: (_) {
                            setSheetState(() {
                              tempProvider = null;
                            });
                          },
                        ),
                        ChoiceChip(
                          label: const Text('MTN'),
                          selected: tempProvider == 'mtn',
                          onSelected: (_) {
                            setSheetState(() {
                              tempProvider = 'mtn';
                            });
                          },
                        ),
                        ChoiceChip(
                          label: const Text('Telecel'),
                          selected: tempProvider == 'telecel',
                          onSelected: (_) {
                            setSheetState(() {
                              tempProvider = 'telecel';
                            });
                          },
                        ),
                        ChoiceChip(
                          label: const Text('AT Money'),
                          selected: tempProvider == 'at_money',
                          onSelected: (_) {
                            setSheetState(() {
                              tempProvider = 'at_money';
                            });
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    OutlinedButton.icon(
                      onPressed: chooseDates,
                      icon: const Icon(Icons.date_range_outlined),
                      label: Text(
                        tempDateRange == null
                            ? 'Choose date range'
                            : _dateRangeLabel(tempDateRange!),
                      ),
                    ),
                    if (tempDateRange != null)
                      TextButton(
                        onPressed: () {
                          setSheetState(() {
                            tempDateRange = null;
                          });
                        },
                        child: const Text('Clear date range'),
                      ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () {
                              setSheetState(() {
                                tempProvider = null;
                                tempDateRange = null;
                              });
                            },
                            child: const Text('Reset'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () {
                              Navigator.pop(sheetContext, true);
                            },
                            child: const Text('Apply'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (applied != true || !mounted) {
      return;
    }

    setState(() {
      _provider = tempProvider;
      _dateRange = tempDateRange;
    });

    await _load();
  }

  static String _dateRangeLabel(DateTimeRange range) {
    return '${_shortDate(range.start)} – ${_shortDate(range.end)}';
  }

  static String _shortDate(DateTime value) {
    final month = value.month.toString().padLeft(2, '0');
    final day = value.day.toString().padLeft(2, '0');

    return '${value.year}-$month-$day';
  }

  @override
  Widget build(BuildContext context) {
    final hasFilters = _provider != null || _dateRange != null;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.branchId == null ? 'Float History' : 'Branch Float History',
        ),
        actions: [
          IconButton(
            onPressed: _showFilters,
            tooltip: hasFilters ? 'Filter · active filters' : 'Filter',
            icon: Icon(
              hasFilters ? Icons.filter_alt : Icons.filter_alt_outlined,
            ),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? EmptyState(
                  icon: Icons.error_outline,
                  title: 'Could not load float history',
                  subtitle: _error,
                  actionLabel: 'Retry',
                  onAction: _load,
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(12),
                    children: [
                      if (hasFilters)
                        _ActiveFilters(
                          provider: _provider,
                          dateRange: _dateRange,
                          onClearProvider: () {
                            setState(() {
                              _provider = null;
                            });
                            _load();
                          },
                          onClearDates: () {
                            setState(() {
                              _dateRange = null;
                            });
                            _load();
                          },
                        ),
                      if (hasFilters) const SizedBox(height: 8),
                      if (_movements.isEmpty)
                        const Padding(
                          padding: EdgeInsets.only(top: 48),
                          child: EmptyState(
                            icon: Icons.history_outlined,
                            title: 'No float movements found',
                            subtitle:
                                'Treasury float activity will appear here.',
                          ),
                        )
                      else
                        ..._movements.map(
                          (movement) => _FloatMovementCard(
                            movement:
                                Map<String, dynamic>.from(movement as Map),
                          ),
                        ),
                      if (_page < _totalPages)
                        Padding(
                          padding: const EdgeInsets.only(top: 8, bottom: 24),
                          child: OutlinedButton(
                            onPressed: _loadingMore
                                ? null
                                : () => _load(loadMore: true),
                            child: _loadingMore
                                ? const SizedBox(
                                    height: 18,
                                    width: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Text('Load more'),
                          ),
                        ),
                    ],
                  ),
                ),
    );
  }
}

class _ActiveFilters extends StatelessWidget {
  final String? provider;
  final DateTimeRange? dateRange;
  final VoidCallback onClearProvider;
  final VoidCallback onClearDates;

  const _ActiveFilters({
    required this.provider,
    required this.dateRange,
    required this.onClearProvider,
    required this.onClearDates,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        if (provider != null)
          InputChip(
            label: Text(_providerLabel(provider!)),
            onDeleted: onClearProvider,
          ),
        if (dateRange != null)
          InputChip(
            label: Text(
              '${_FloatHistoryScreenState._shortDate(dateRange!.start)} – '
              '${_FloatHistoryScreenState._shortDate(dateRange!.end)}',
            ),
            onDeleted: onClearDates,
          ),
      ],
    );
  }
}

class _FloatMovementCard extends StatelessWidget {
  final Map<String, dynamic> movement;

  const _FloatMovementCard({required this.movement});

  @override
  Widget build(BuildContext context) {
    final provider = movement['provider']?.toString() ?? '';

    final amount = double.tryParse(movement['amount']?.toString() ?? '0') ?? 0;

    final before =
        double.tryParse(movement['balance_before']?.toString() ?? '0') ?? 0;

    final after =
        double.tryParse(movement['balance_after']?.toString() ?? '0') ?? 0;

    final reference = movement['reference']?.toString().trim();

    final performedBy = movement['performed_by_name']?.toString().trim();

    final createdAt = DateTime.tryParse(
      movement['created_at']?.toString() ?? '',
    );

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                ProviderBadge(provider: provider),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _movementLabel(
                          movement['movement_type']?.toString() ?? 'movement',
                        ),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        movement['branch_name']?.toString() ?? 'Branch',
                        style: TextStyle(
                          color: context.appSecondaryText,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                GhsAmount(amount: amount, fontSize: 16),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Text(
                  'Before',
                  style: TextStyle(
                    color: context.appSecondaryText,
                    fontSize: 11,
                  ),
                ),
                const Spacer(),
                Text(
                  'GH₵ ${before.toStringAsFixed(2)}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8),
                  child: Icon(Icons.arrow_forward, size: 14),
                ),
                Text(
                  'GH₵ ${after.toStringAsFixed(2)}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            if (reference != null && reference.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Reference: $reference',
                style: TextStyle(color: context.appSecondaryText, fontSize: 11),
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    performedBy != null && performedBy.isNotEmpty
                        ? 'By $performedBy'
                        : 'System activity',
                    style: TextStyle(
                      color: context.appSecondaryText,
                      fontSize: 11,
                    ),
                  ),
                ),
                Text(
                  _dateTimeLabel(createdAt),
                  style: TextStyle(
                    color: context.appSecondaryText,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
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
}

String _movementLabel(String value) {
  return value
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}

String _providerLabel(String provider) {
  return switch (provider) {
    'mtn' => 'MTN Mobile Money',
    'telecel' => 'Telecel Cash',
    'at_money' => 'AT Money',
    _ => provider,
  };
}
