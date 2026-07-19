// marketplace_screen.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
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
  @override
  Widget build(BuildContext context) {
    final price = double.tryParse(ad['price']?.toString() ?? '0') ?? 0;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/marketplace/ads/${ad['id']}'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(height: 100, color: AppTheme.primaryColor.withOpacity(0.1),
            child: const Center(child: Icon(Icons.image_outlined, size: 40, color: Colors.grey))),
          Padding(padding: const EdgeInsets.all(8), child: Column(
            crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(ad['title'] ?? '', maxLines: 2, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
              const SizedBox(height: 4),
              if (price > 0) Text('GH₵ ${price.toStringAsFixed(2)}',
                style: const TextStyle(color: AppTheme.primaryColor, fontWeight: FontWeight.bold, fontSize: 13)),
              if (ad['location'] != null) Text(ad['location'],
                style: const TextStyle(color: Colors.grey, fontSize: 10), maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
          )),
        ]),
      ),
    );
  }
}
