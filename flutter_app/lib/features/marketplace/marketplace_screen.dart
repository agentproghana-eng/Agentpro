// marketplace_screen.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';

class MarketplaceScreen extends StatefulWidget {
  const MarketplaceScreen({super.key});
  @override
  State<MarketplaceScreen> createState() => _MarketplaceScreenState();
}

class _MarketplaceScreenState extends State<MarketplaceScreen> {
  List<dynamic> _ads = [];
  bool _loading = true;
  final _searchCtrl = TextEditingController();

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load([String? search]) async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get('/marketplace',
        queryParameters: (search != null && search.isNotEmpty) ? {'search': search} : {});
      if (mounted) setState(() { _ads = res.data['data'] ?? []; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Business Hub'),
        actions: [
          TextButton.icon(
            onPressed: () => context.push('/marketplace/mine'),
            icon: const Icon(Icons.person_outline, color: Colors.white, size: 18),
            label: const Text('My Ads', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            controller: _searchCtrl,
            decoration: InputDecoration(
              hintText: 'Search Business Hub...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: IconButton(icon: const Icon(Icons.clear), onPressed: () { _searchCtrl.clear(); _load(); }),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              contentPadding: const EdgeInsets.symmetric(vertical: 0),
              isDense: true,
            ),
            onSubmitted: _load,
          ),
        ),
        Expanded(child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _ads.isEmpty
              ? const EmptyState(icon: Icons.storefront_outlined, title: 'No ads found')
              : RefreshIndicator(
                  onRefresh: () async => _load(),
                  child: GridView.builder(
                    padding: const EdgeInsets.all(12),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2, childAspectRatio: 0.75, crossAxisSpacing: 10, mainAxisSpacing: 10),
                    itemCount: _ads.length,
                    itemBuilder: (_, i) => _AdCard(ad: _ads[i]),
                  ),
                )),
      ]),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/marketplace/post'),
        icon: const Icon(Icons.add),
        label: const Text('Post Ad'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: AppTheme.secondaryColor,
      ),
    );
  }
}

class _AdCard extends StatelessWidget {
  final Map<String, dynamic> ad;
  const _AdCard({required this.ad});

  // Relative time since publish (e.g. "2d ago") - simple local
  // calculation rather than pulling in a new package for this alone.
  String _relativeTime(String? dateStr) {
    if (dateStr == null) return '';
    final date = DateTime.tryParse(dateStr);
    if (date == null) return '';
    final diff = DateTime.now().difference(date.toLocal());
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    if (diff.inMinutes > 0) return '${diff.inMinutes}m ago';
    return 'just now';
  }

  @override
  Widget build(BuildContext context) {
    final price = double.tryParse(ad['price']?.toString() ?? '0') ?? 0;
    final hasRating = (int.tryParse(ad['rating_count']?.toString() ?? '0') ?? 0) > 0;
    final time = _relativeTime(ad['published_at'] as String?);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/marketplace/ads/${ad['id']}'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // 2/3 of the card - full uncropped photo (letterboxed if the
          // aspect ratio doesn't match, rather than cropping content
          // out of the seller's photo).
          Expanded(
            flex: 2,
            child: Container(
              width: double.infinity,
              color: AppTheme.primaryColor.withOpacity(0.1),
              child: (ad['image_urls'] != null && (ad['image_urls'] as List).isNotEmpty)
                  ? Image.network(
                      (ad['image_urls'] as List).first as String,
                      width: double.infinity, fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => Center(child: Icon(Icons.image_outlined, size: 40, color: context.appSecondaryText)),
                    )
                  : Center(child: Icon(Icons.image_outlined, size: 40, color: context.appSecondaryText)),
            ),
          ),
          // 1/3 of the card - title, price, location, rating+date.
          Expanded(
            flex: 1,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.start,
                children: [
                  Text(ad['title'] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                  if (price > 0) ...[
                    const SizedBox(height: 2),
                    Text(
                      'GH₵ ${price.toStringAsFixed(2)}',
                      style: TextStyle(
                        color: context.isDarkMode ? AppTheme.primaryLight : AppTheme.primaryColor,
                        fontWeight: FontWeight.bold, fontSize: 13,
                      ),
                    ),
                  ],
                  if (ad['location'] != null) ...[
                    const SizedBox(height: 2),
                    Text(ad['location'], style: TextStyle(color: context.appSecondaryText, fontSize: 10),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                  if (hasRating || time.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Row(children: [
                      if (hasRating) ...[
                        const Icon(Icons.star, size: 10, color: Color(0xFFFFB300)),
                        const SizedBox(width: 2),
                        Text(double.parse(ad['avg_rating'].toString()).toStringAsFixed(1),
                          style: TextStyle(color: context.appSecondaryText, fontSize: 9)),
                        if (time.isNotEmpty) Text(' · ', style: TextStyle(color: context.appSecondaryText, fontSize: 9)),
                      ],
                      if (time.isNotEmpty) Text(time, style: TextStyle(color: context.appSecondaryText, fontSize: 9)),
                    ]),
                  ],
                ],
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
