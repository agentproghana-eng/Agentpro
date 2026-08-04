import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class SavedAdsScreen extends StatefulWidget {
  const SavedAdsScreen({super.key});

  @override
  State<SavedAdsScreen> createState() => _SavedAdsScreenState();
}

class _SavedAdsScreenState extends State<SavedAdsScreen> {
  List<Map<String, dynamic>> _ads = [];
  bool _loading = true;
  String? _error;
  final Set<String> _updatingIds = <String>{};

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
      final response = await ApiClient.instance.get('/marketplace/saved');
      final raw = response.data['data'];

      if (!mounted) return;

      setState(() {
        _ads = raw is List
            ? raw
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
            : [];
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;

      setState(() {
        _error = e.response?.data?['message'] ?? 'Failed to load saved ads.';
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _error = 'Failed to load saved ads.';
        _loading = false;
      });
    }
  }

  Future<void> _removeSavedAd(Map<String, dynamic> ad) async {
    final id = ad['id']?.toString();
    if (id == null || _updatingIds.contains(id)) return;

    setState(() => _updatingIds.add(id));

    try {
      await ApiClient.instance.delete('/marketplace/$id/save');

      if (!mounted) return;

      setState(() {
        _ads.removeWhere((item) => item['id']?.toString() == id);
      });
    } on DioException catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.response?.data?['message'] ??
                'Failed to remove saved advertisement.',
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
        title: const Text('Saved Ads'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 180),
                  Center(child: CircularProgressIndicator()),
                ],
              )
            : _error != null
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(24),
                    children: [
                      const SizedBox(height: 100),
                      const Icon(Icons.error_outline, size: 48),
                      const SizedBox(height: 12),
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _load,
                        child: const Text('Try Again'),
                      ),
                    ],
                  )
                : _ads.isEmpty
                    ? const ListView(
                        physics: AlwaysScrollableScrollPhysics(),
                        padding: EdgeInsets.all(24),
                        children: [
                          SizedBox(height: 100),
                          Icon(Icons.favorite_border, size: 58),
                          SizedBox(height: 12),
                          Text(
                            'No saved advertisements',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          SizedBox(height: 6),
                          Text(
                            'Tap the heart icon on an advertisement to save it.',
                            textAlign: TextAlign.center,
                          ),
                        ],
                      )
                    : GridView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(12),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          childAspectRatio: 0.73,
                          crossAxisSpacing: 10,
                          mainAxisSpacing: 10,
                        ),
                        itemCount: _ads.length,
                        itemBuilder: (context, index) {
                          final ad = _ads[index];
                          final id = ad['id']?.toString() ?? '';
                          final images = ad['image_urls'];
                          final hasImage = images is List && images.isNotEmpty;
                          final price = double.tryParse(
                                ad['price']?.toString() ?? '',
                              ) ??
                              0;

                          return Card(
                            clipBehavior: Clip.antiAlias,
                            child: InkWell(
                              onTap: () => context.push(
                                '/marketplace/ads/$id',
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Stack(
                                      fit: StackFit.expand,
                                      children: [
                                        Container(
                                          color: AppTheme.primaryColor
                                              .withValues(alpha: 0.1),
                                          child: hasImage
                                              ? Image.network(
                                                  images.first.toString(),
                                                  fit: BoxFit.contain,
                                                  errorBuilder: (_, __, ___) =>
                                                      const Icon(
                                                    Icons.image_outlined,
                                                    size: 42,
                                                  ),
                                                )
                                              : const Icon(
                                                  Icons.image_outlined,
                                                  size: 42,
                                                ),
                                        ),
                                        Positioned(
                                          top: 4,
                                          right: 4,
                                          child: IconButton.filledTonal(
                                            tooltip: 'Remove saved ad',
                                            onPressed: _updatingIds.contains(id)
                                                ? null
                                                : () => _removeSavedAd(ad),
                                            icon: _updatingIds.contains(id)
                                                ? const SizedBox(
                                                    width: 18,
                                                    height: 18,
                                                    child:
                                                        CircularProgressIndicator(
                                                      strokeWidth: 2,
                                                    ),
                                                  )
                                                : const Icon(
                                                    Icons.favorite,
                                                  ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.all(9),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          ad['title']?.toString() ?? '',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        if (price > 0) ...[
                                          const SizedBox(height: 4),
                                          Text(
                                            'GH₵ ${price.toStringAsFixed(2)}',
                                            style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ],
                                        if (ad['location'] != null) ...[
                                          const SizedBox(height: 3),
                                          Text(
                                            ad['location'].toString(),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style:
                                                const TextStyle(fontSize: 11),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
