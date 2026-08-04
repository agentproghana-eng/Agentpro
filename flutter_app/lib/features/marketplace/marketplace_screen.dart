import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class MarketplaceScreen extends StatefulWidget {
  const MarketplaceScreen({super.key});

  @override
  State<MarketplaceScreen> createState() => _MarketplaceScreenState();
}

class _MarketplaceScreenState extends State<MarketplaceScreen> {
  List<Map<String, dynamic>> _ads = [];
  final Set<String> _savedIds = <String>{};
  final Set<String> _updatingIds = <String>{};

  bool _loading = true;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load([String? search]) async {
    setState(() => _loading = true);

    try {
      final responses = await Future.wait([
        ApiClient.instance.get(
          '/marketplace',
          queryParameters: search != null && search.trim().isNotEmpty
              ? {'search': search.trim()}
              : <String, dynamic>{},
        ),
        ApiClient.instance.get('/marketplace/saved/ids'),
      ]);

      final rawAds = responses[0].data['data'];
      final rawSavedIds = responses[1].data['data'];

      if (!mounted) return;

      setState(() {
        _ads = rawAds is List
            ? rawAds
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
            : [];

        _savedIds
          ..clear()
          ..addAll(
            rawSavedIds is List
                ? rawSavedIds.map((id) => id.toString())
                : const <String>[],
          );

        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _toggleSaved(Map<String, dynamic> ad) async {
    final id = ad['id']?.toString();
    if (id == null || _updatingIds.contains(id)) return;

    final wasSaved = _savedIds.contains(id);

    setState(() {
      _updatingIds.add(id);
      if (wasSaved) {
        _savedIds.remove(id);
      } else {
        _savedIds.add(id);
      }
    });

    try {
      if (wasSaved) {
        await ApiClient.instance.delete('/marketplace/$id/save');
      } else {
        await ApiClient.instance.post('/marketplace/$id/save');
      }
    } on DioException catch (e) {
      if (!mounted) return;

      setState(() {
        if (wasSaved) {
          _savedIds.add(id);
        } else {
          _savedIds.remove(id);
        }
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.response?.data?['message'] ??
                'Failed to update saved advertisement.',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _updatingIds.remove(id));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Business Hub'),
        actions: [
          IconButton(
            tooltip: 'Saved Ads',
            onPressed: () async {
              await context.push('/marketplace/saved');
              if (mounted) _load(_searchController.text);
            },
            icon: const Icon(Icons.favorite_outline),
          ),
          TextButton.icon(
            onPressed: () => context.push('/marketplace/mine'),
            icon: const Icon(
              Icons.person_outline,
              color: Colors.white,
              size: 18,
            ),
            label: const Text(
              'My Ads',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search Business Hub...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () {
                    _searchController.clear();
                    _load();
                  },
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
                isDense: true,
              ),
              onSubmitted: _load,
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _ads.isEmpty
                    ? const EmptyState(
                        icon: Icons.storefront_outlined,
                        title: 'No ads found',
                      )
                    : RefreshIndicator(
                        onRefresh: () => _load(_searchController.text),
                        child: GridView.builder(
                          padding: const EdgeInsets.all(12),
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            childAspectRatio: 0.75,
                            crossAxisSpacing: 10,
                            mainAxisSpacing: 10,
                          ),
                          itemCount: _ads.length,
                          itemBuilder: (context, index) {
                            final ad = _ads[index];
                            final id = ad['id']?.toString() ?? '';

                            return _AdCard(
                              ad: ad,
                              isSaved: _savedIds.contains(id),
                              isUpdating: _updatingIds.contains(id),
                              onToggleSaved: () => _toggleSaved(ad),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/marketplace/post'),
        icon: const Icon(Icons.add),
        label: const Text('Post Ad'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: AppTheme.secondaryColor,
      ),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }
}

class _AdCard extends StatelessWidget {
  final Map<String, dynamic> ad;
  final bool isSaved;
  final bool isUpdating;
  final VoidCallback onToggleSaved;

  const _AdCard({
    required this.ad,
    required this.isSaved,
    required this.isUpdating,
    required this.onToggleSaved,
  });

  String _relativeTime(String? dateString) {
    if (dateString == null) return '';

    final date = DateTime.tryParse(dateString);
    if (date == null) return '';

    final difference = DateTime.now().difference(date.toLocal());

    if (difference.inDays > 0) return '${difference.inDays}d ago';
    if (difference.inHours > 0) return '${difference.inHours}h ago';
    if (difference.inMinutes > 0) return '${difference.inMinutes}m ago';

    return 'just now';
  }

  @override
  Widget build(BuildContext context) {
    final price = double.tryParse(ad['price']?.toString() ?? '0') ?? 0;

    final ratingCount =
        int.tryParse(ad['rating_count']?.toString() ?? '0') ?? 0;

    final hasRating = ratingCount > 0;
    final time = _relativeTime(ad['published_at']?.toString());

    final images = ad['image_urls'];
    final hasImage = images is List && images.isNotEmpty;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/marketplace/ads/${ad['id']}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 2,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Container(
                    color: AppTheme.primaryColor.withValues(alpha: 0.1),
                    child: hasImage
                        ? Image.network(
                            images.first.toString(),
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => Center(
                              child: Icon(
                                Icons.image_outlined,
                                size: 40,
                                color: context.appSecondaryText,
                              ),
                            ),
                          )
                        : Center(
                            child: Icon(
                              Icons.image_outlined,
                              size: 40,
                              color: context.appSecondaryText,
                            ),
                          ),
                  ),
                  Positioned(
                    top: 4,
                    right: 4,
                    child: IconButton.filledTonal(
                      tooltip: isSaved ? 'Remove from saved' : 'Save ad',
                      onPressed: isUpdating ? null : onToggleSaved,
                      icon: isUpdating
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                              ),
                            )
                          : Icon(
                              isSaved ? Icons.favorite : Icons.favorite_border,
                            ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 6,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      ad['title']?.toString() ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                      ),
                    ),
                    if (price > 0) ...[
                      const SizedBox(height: 2),
                      Text(
                        'GH₵ ${price.toStringAsFixed(2)}',
                        style: TextStyle(
                          color: context.isDarkMode
                              ? AppTheme.primaryLight
                              : AppTheme.primaryColor,
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                    ],
                    if (ad['location'] != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        ad['location'].toString(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: context.appSecondaryText,
                          fontSize: 10,
                        ),
                      ),
                    ],
                    if (hasRating || time.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          if (hasRating) ...[
                            const Icon(
                              Icons.star,
                              size: 10,
                              color: Color(0xFFFFB300),
                            ),
                            const SizedBox(width: 2),
                            Text(
                              double.tryParse(
                                    ad['avg_rating']?.toString() ?? '0',
                                  )?.toStringAsFixed(1) ??
                                  '0.0',
                              style: TextStyle(
                                color: context.appSecondaryText,
                                fontSize: 9,
                              ),
                            ),
                            if (time.isNotEmpty)
                              Text(
                                ' · ',
                                style: TextStyle(
                                  color: context.appSecondaryText,
                                  fontSize: 9,
                                ),
                              ),
                          ],
                          if (time.isNotEmpty)
                            Text(
                              time,
                              style: TextStyle(
                                color: context.appSecondaryText,
                                fontSize: 9,
                              ),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
