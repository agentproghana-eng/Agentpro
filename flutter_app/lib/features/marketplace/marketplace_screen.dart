import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_cache.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_network_image.dart';
import '../../shared/widgets/app_widgets.dart';

class MarketplaceScreen extends StatefulWidget {
  const MarketplaceScreen({super.key});

  @override
  State<MarketplaceScreen> createState() => _MarketplaceScreenState();
}

class _MarketplaceScreenState extends State<MarketplaceScreen> {
  List<Map<String, dynamic>> _ads = [];
  List<Map<String, dynamic>> _topRatedAds = [];
  List<Map<String, dynamic>> _trendingAds = [];
  List<Map<String, dynamic>> _recommendedAds = [];
  List<Map<String, dynamic>> _recentlyViewedAds = [];
  List<Map<String, dynamic>> _categories = [];

  final Set<String> _savedIds = <String>{};
  final Set<String> _updatingIds = <String>{};

  final _searchController = TextEditingController();
  final _locationController = TextEditingController();
  final _minPriceController = TextEditingController();
  final _maxPriceController = TextEditingController();

  bool _loading = true;
  String? _error;
  String? _selectedCategoryId;
  double? _minimumRating;
  String _sort = 'newest';

  static const Map<String, String> _sortLabels = {
    'newest': 'Newest',
    'oldest': 'Oldest',
    'most_viewed': 'Most Viewed',
    'highest_rated': 'Highest Rated',
    'price_low': 'Price: Low to High',
    'price_high': 'Price: High to Low',
  };

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  int get _activeFilterCount {
    var count = 0;

    if (_selectedCategoryId != null) count++;
    if (_locationController.text.trim().isNotEmpty) count++;
    if (_minPriceController.text.trim().isNotEmpty) count++;
    if (_maxPriceController.text.trim().isNotEmpty) count++;
    if (_minimumRating != null) count++;
    if (_sort != 'newest') count++;

    return count;
  }

  bool get _showHomeSections {
    return _searchController.text.trim().isEmpty &&
        _selectedCategoryId == null &&
        _locationController.text.trim().isEmpty &&
        _minPriceController.text.trim().isEmpty &&
        _maxPriceController.text.trim().isEmpty &&
        _minimumRating == null &&
        _sort == 'newest';
  }

  Future<void> _loadInitialData() async {
    await Future.wait([
      _loadCategories(),
      _load(),
    ]);
  }

  Future<void> _loadCategories() async {
    try {
      final categories = await ApiCache.getOrLoad<List<Map<String, dynamic>>>(
        key: 'marketplace:categories',
        ttl: const Duration(hours: 1),
        loader: () async {
          final response = await ApiClient.instance.get(
            '/marketplace/categories',
          );

          final raw = response.data['data'];

          return raw is List
              ? raw
                  .whereType<Map>()
                  .map(
                    (item) => Map<String, dynamic>.from(item),
                  )
                  .toList()
              : <Map<String, dynamic>>[];
        },
      );

      if (!mounted) return;

      setState(() {
        _categories = categories;
      });
    } catch (_) {
      // Categories are useful but not critical enough to block browsing.
    }
  }

  Map<String, dynamic> _queryParameters() {
    final parameters = <String, dynamic>{
      'sort': _sort,
    };

    final search = _searchController.text.trim();
    final location = _locationController.text.trim();
    final minPrice = _minPriceController.text.trim();
    final maxPrice = _maxPriceController.text.trim();

    if (search.isNotEmpty) parameters['search'] = search;
    if (_selectedCategoryId != null) {
      parameters['category_id'] = _selectedCategoryId;
    }
    if (location.isNotEmpty) parameters['location'] = location;
    if (minPrice.isNotEmpty) parameters['min_price'] = minPrice;
    if (maxPrice.isNotEmpty) parameters['max_price'] = maxPrice;
    if (_minimumRating != null) {
      parameters['min_rating'] = _minimumRating;
    }

    return parameters;
  }

  Future<dynamic> _cachedMarketplaceGet(
    String key,
    String path, {
    Map<String, dynamic>? queryParameters,
    Duration ttl = const Duration(minutes: 3),
    bool forceRefresh = false,
  }) {
    return ApiCache.getOrLoad<dynamic>(
      key: key,
      ttl: ttl,
      forceRefresh: forceRefresh,
      loader: () async {
        final response = await ApiClient.instance.get(
          path,
          queryParameters: queryParameters,
        );

        return response.data['data'];
      },
    );
  }

  Future<void> _load({bool forceRefresh = false}) async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      if (_showHomeSections) {
        final responses = await Future.wait([
          _cachedMarketplaceGet(
            'marketplace:home:latest',
            '/marketplace',
            queryParameters: {
              'sort': 'newest',
              'limit': 20,
            },
            forceRefresh: forceRefresh,
          ),
          _cachedMarketplaceGet(
            'marketplace:home:top-rated',
            '/marketplace',
            queryParameters: {
              'sort': 'highest_rated',
              'limit': 8,
            },
            forceRefresh: forceRefresh,
          ),
          _cachedMarketplaceGet(
            'marketplace:home:trending',
            '/marketplace',
            queryParameters: {
              'sort': 'most_viewed',
              'limit': 8,
            },
            forceRefresh: forceRefresh,
          ),
          _cachedMarketplaceGet(
            'marketplace:home:recommendations',
            '/marketplace/recommendations',
            queryParameters: {'limit': 8},
            forceRefresh: forceRefresh,
          ),
          _cachedMarketplaceGet(
            'marketplace:home:recently-viewed',
            '/marketplace/recently-viewed',
            queryParameters: {'limit': 8},
            forceRefresh: forceRefresh,
          ),
          _cachedMarketplaceGet(
            'marketplace:saved-ids',
            '/marketplace/saved/ids',
            ttl: const Duration(minutes: 1),
            forceRefresh: forceRefresh,
          ),
        ]);

        final rawLatest = responses[0];
        final rawTopRated = responses[1];
        final rawTrending = responses[2];
        final rawRecommendations = responses[3];
        final rawRecentlyViewed = responses[4];
        final rawSavedIds = responses[5];

        if (!mounted) return;

        setState(() {
          _ads = _mapAds(rawLatest);
          _topRatedAds = _mapAds(rawTopRated);
          _trendingAds = _mapAds(rawTrending);
          _recommendedAds = _mapAds(rawRecommendations);
          _recentlyViewedAds = _mapAds(rawRecentlyViewed);

          _savedIds
            ..clear()
            ..addAll(
              rawSavedIds is List
                  ? rawSavedIds.map((id) => id.toString())
                  : const <String>[],
            );

          _loading = false;
        });

        return;
      }

      final responses = await Future.wait([
        ApiClient.instance.get(
          '/marketplace',
          queryParameters: _queryParameters(),
        ),
        ApiClient.instance.get('/marketplace/saved/ids'),
      ]);

      final rawAds = responses[0].data['data'];
      final rawSavedIds = responses[1].data['data'];

      if (!mounted) return;

      setState(() {
        _ads = _mapAds(rawAds);
        _topRatedAds = [];
        _trendingAds = [];
        _recommendedAds = [];
        _recentlyViewedAds = [];

        _savedIds
          ..clear()
          ..addAll(
            rawSavedIds is List
                ? rawSavedIds.map((id) => id.toString())
                : const <String>[],
          );

        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;

      setState(() {
        _error =
            e.response?.data?['message'] ?? 'Failed to load advertisements.';
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _error = 'Failed to load advertisements.';
        _loading = false;
      });
    }
  }

  List<Map<String, dynamic>> _mapAds(dynamic raw) {
    if (raw is! List) return [];

    return raw
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
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

      ApiCache.invalidate('marketplace:saved-ids');
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

  void _selectCategory(String? categoryId) {
    setState(() => _selectedCategoryId = categoryId);
    _load();
  }

  void _clearFilters() {
    setState(() {
      _selectedCategoryId = null;
      _minimumRating = null;
      _sort = 'newest';
      _locationController.clear();
      _minPriceController.clear();
      _maxPriceController.clear();
    });

    _load();
  }

  Future<void> _showFilters() async {
    String? draftCategoryId = _selectedCategoryId;
    double? draftRating = _minimumRating;
    String draftSort = _sort;

    final locationController = TextEditingController(
      text: _locationController.text,
    );
    final minPriceController = TextEditingController(
      text: _minPriceController.text,
    );
    final maxPriceController = TextEditingController(
      text: _maxPriceController.text,
    );

    final applied = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return SafeArea(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  20,
                  0,
                  20,
                  MediaQuery.viewInsetsOf(context).bottom + 20,
                ),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Filter Advertisements',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 20),
                      DropdownButtonFormField<String?>(
                        initialValue: draftCategoryId,
                        decoration: const InputDecoration(
                          labelText: 'Category',
                          border: OutlineInputBorder(),
                        ),
                        items: [
                          const DropdownMenuItem<String?>(
                            value: null,
                            child: Text('All categories'),
                          ),
                          ..._categories.map(
                            (category) => DropdownMenuItem<String?>(
                              value: category['id']?.toString(),
                              child: Text(
                                category['name']?.toString() ?? '',
                              ),
                            ),
                          ),
                        ],
                        onChanged: (value) {
                          setSheetState(() => draftCategoryId = value);
                        },
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: locationController,
                        decoration: const InputDecoration(
                          labelText: 'Location',
                          hintText: 'e.g. Accra, Kumasi',
                          prefixIcon: Icon(Icons.location_on_outlined),
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: minPriceController,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                decimal: true,
                              ),
                              decoration: const InputDecoration(
                                labelText: 'Minimum price',
                                prefixText: 'GH₵ ',
                                border: OutlineInputBorder(),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: maxPriceController,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                decimal: true,
                              ),
                              decoration: const InputDecoration(
                                labelText: 'Maximum price',
                                prefixText: 'GH₵ ',
                                border: OutlineInputBorder(),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      const Text(
                        'Minimum rating',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          ChoiceChip(
                            label: const Text('Any'),
                            selected: draftRating == null,
                            onSelected: (_) {
                              setSheetState(() => draftRating = null);
                            },
                          ),
                          for (final rating in [3.0, 4.0, 4.5])
                            ChoiceChip(
                              label: Text('$rating+ ★'),
                              selected: draftRating == rating,
                              onSelected: (_) {
                                setSheetState(() => draftRating = rating);
                              },
                            ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      DropdownButtonFormField<String>(
                        initialValue: draftSort,
                        decoration: const InputDecoration(
                          labelText: 'Sort by',
                          border: OutlineInputBorder(),
                        ),
                        items: _sortLabels.entries
                            .map(
                              (entry) => DropdownMenuItem(
                                value: entry.key,
                                child: Text(entry.value),
                              ),
                            )
                            .toList(),
                        onChanged: (value) {
                          if (value != null) {
                            setSheetState(() => draftSort = value);
                          }
                        },
                      ),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        onPressed: () {
                          Navigator.pop(sheetContext, true);
                        },
                        icon: const Icon(Icons.filter_alt),
                        label: const Text('Apply Filters'),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );

    if (applied == true) {
      setState(() {
        _selectedCategoryId = draftCategoryId;
        _minimumRating = draftRating;
        _sort = draftSort;
        _locationController.text = locationController.text.trim();
        _minPriceController.text = minPriceController.text.trim();
        _maxPriceController.text = maxPriceController.text.trim();
      });

      await _load();
    }

    locationController.dispose();
    minPriceController.dispose();
    maxPriceController.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Business Hub'),
        actions: [
          IconButton(
            tooltip: 'Business Hub menu',
            onPressed: () => context.push('/marketplace/more'),
            icon: const Icon(Icons.more_vert),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: 'Search products, services or location',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: _searchController.text.isEmpty
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: () {
                                _searchController.clear();
                                setState(() {});
                                _load();
                              },
                            ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      contentPadding: const EdgeInsets.symmetric(vertical: 0),
                      isDense: true,
                    ),
                    onChanged: (_) => setState(() {}),
                    onSubmitted: (_) => _load(),
                  ),
                ),
                const SizedBox(width: 8),
                Badge(
                  isLabelVisible: _activeFilterCount > 0,
                  label: Text(_activeFilterCount.toString()),
                  child: IconButton.filledTonal(
                    tooltip: 'Filters',
                    onPressed: _showFilters,
                    icon: const Icon(Icons.tune),
                  ),
                ),
              ],
            ),
          ),
          if (_categories.isNotEmpty)
            SizedBox(
              height: 48,
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                scrollDirection: Axis.horizontal,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: const Text('All'),
                      selected: _selectedCategoryId == null,
                      onSelected: (_) => _selectCategory(null),
                    ),
                  ),
                  ..._categories.map(
                    (category) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(
                          category['name']?.toString() ?? '',
                        ),
                        selected:
                            _selectedCategoryId == category['id']?.toString(),
                        onSelected: (_) => _selectCategory(
                          category['id']?.toString(),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          if (_activeFilterCount > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '$_activeFilterCount filter'
                      '${_activeFilterCount == 1 ? '' : 's'} applied'
                      ' · ${_sortLabels[_sort]}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  TextButton(
                    onPressed: _clearFilters,
                    child: const Text('Clear all'),
                  ),
                ],
              ),
            ),
          Expanded(child: _buildResults()),
        ],
      ),
    );
  }

  Widget _buildResults() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return EmptyState(
        icon: Icons.error_outline,
        title: 'Could not load advertisements',
        subtitle: _error,
        actionLabel: 'Try Again',
        onAction: _load,
      );
    }

    if (_ads.isEmpty) {
      return EmptyState(
        icon: Icons.storefront_outlined,
        title: 'No advertisements found',
        subtitle:
            _activeFilterCount > 0 || _searchController.text.trim().isNotEmpty
                ? 'Try changing or clearing your search and filters.'
                : 'New advertisements will appear here.',
        actionLabel: _activeFilterCount > 0 ? 'Clear Filters' : null,
        onAction: _activeFilterCount > 0 ? _clearFilters : null,
      );
    }

    if (_showHomeSections) {
      return _buildMarketplaceHome();
    }

    return RefreshIndicator(
      onRefresh: () => _load(forceRefresh: true),
      child: GridView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(12),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 0.60,
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
        ),
        itemCount: _ads.length,
        itemBuilder: (context, index) {
          final ad = _ads[index];
          final id = ad['id']?.toString() ?? '';

          return _AdCard(
            key: ValueKey(
              id.isNotEmpty ? id : index,
            ),
            ad: ad,
            isSaved: _savedIds.contains(id),
            isUpdating: _updatingIds.contains(id),
            onToggleSaved: () => _toggleSaved(ad),
          );
        },
      ),
    );
  }

  List<Map<String, dynamic>> _excludeSeen(
    List<Map<String, dynamic>> source,
    Set<String> seen,
  ) {
    final result = <Map<String, dynamic>>[];

    for (final ad in source) {
      final id = ad['id']?.toString() ?? '';

      if (id.isEmpty || seen.add(id)) {
        result.add(ad);
      }
    }

    return result;
  }

  Widget _buildMarketplaceHome() {
    final seen = <String>{};

    final topRatedWithReviews = _topRatedAds.where((ad) {
      final ratingCount =
          int.tryParse(ad['rating_count']?.toString() ?? '') ?? 0;

      return ratingCount > 0;
    }).toList(growable: false);

    final topRated = _excludeSeen(topRatedWithReviews, seen);
    final trending = _excludeSeen(_trendingAds, seen);
    final recommended = _excludeSeen(_recommendedAds, seen);
    final recentlyViewed = _excludeSeen(_recentlyViewedAds, seen);

    final sections = <Widget>[
      if (topRated.isNotEmpty)
        _buildGridSection(
          title: 'Top Rated',
          subtitle: 'Popular items with strong buyer reviews',
          ads: topRated,
          onViewAll: () {
            setState(() => _sort = 'highest_rated');
            _load();
          },
        ),
      if (trending.isNotEmpty)
        _buildGridSection(
          title: 'Trending Now',
          subtitle: 'Items getting the most attention',
          ads: trending,
          onViewAll: () {
            setState(() => _sort = 'most_viewed');
            _load();
          },
        ),
      if (recommended.isNotEmpty)
        _buildGridSection(
          title: 'Recommended for You',
          subtitle: 'Suggestions based on your browsing',
          ads: recommended,
          onViewAll: _showRecommendationsSheet,
        ),
      if (recentlyViewed.isNotEmpty)
        _buildGridSection(
          title: 'Recently Viewed',
          subtitle: 'Continue exploring items you opened',
          ads: recentlyViewed,
          onViewAll: _showRecentlyViewedSheet,
        ),
    ];

    return RefreshIndicator(
      onRefresh: () => _load(forceRefresh: true),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          if (sections.isNotEmpty)
            SliverList.builder(
              itemCount: sections.length,
              itemBuilder: (context, index) => sections[index],
            ),
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(16, 22, 16, 10),
              child: Text(
                'Latest Ads',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            sliver: SliverGrid.builder(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                childAspectRatio: 0.60,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
              ),
              itemCount: _ads.length,
              itemBuilder: (context, index) {
                final ad = _ads[index];
                final id = ad['id']?.toString() ?? '';

                return _AdCard(
                  key: ValueKey(id.isNotEmpty ? id : index),
                  ad: ad,
                  isSaved: _savedIds.contains(id),
                  isUpdating: _updatingIds.contains(id),
                  onToggleSaved: () => _toggleSaved(ad),
                );
              },
            ),
          ),
          const SliverToBoxAdapter(
            child: SizedBox(height: 32),
          ),
        ],
      ),
    );
  }

  Future<void> _showRecommendationsSheet() {
    return _showAdCollectionSheet(
      title: 'Recommended for You',
      subtitle: 'Suggestions based on your marketplace activity',
      ads: _recommendedAds,
    );
  }

  Future<void> _showRecentlyViewedSheet() {
    return _showAdCollectionSheet(
      title: 'Recently Viewed',
      subtitle: 'Advertisements you opened recently',
      ads: _recentlyViewedAds,
    );
  }

  Future<void> _showAdCollectionSheet({
    required String title,
    required String subtitle,
    required List<Map<String, dynamic>> ads,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) {
        return FractionallySizedBox(
          heightFactor: 0.88,
          child: SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: GridView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      childAspectRatio: 0.60,
                      crossAxisSpacing: 10,
                      mainAxisSpacing: 10,
                    ),
                    itemCount: ads.length,
                    itemBuilder: (context, index) {
                      final ad = ads[index];
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
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildGridSection({
    required String title,
    required String subtitle,
    required List<Map<String, dynamic>> ads,
    required VoidCallback onViewAll,
  }) {
    final preview = ads.take(4).toList(growable: false);

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 18, 12, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: onViewAll,
                child: const Text('See all'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 0.60,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
            ),
            itemCount: preview.length,
            itemBuilder: (context, index) {
              final ad = preview[index];
              final id = ad['id']?.toString() ?? '';

              return _AdCard(
                ad: ad,
                isSaved: _savedIds.contains(id),
                isUpdating: _updatingIds.contains(id),
                onToggleSaved: () => _toggleSaved(ad),
              );
            },
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    _locationController.dispose();
    _minPriceController.dispose();
    _maxPriceController.dispose();
    super.dispose();
  }
}

class _AdCard extends StatelessWidget {
  final Map<String, dynamic> ad;
  final bool isSaved;
  final bool isUpdating;
  final VoidCallback onToggleSaved;

  const _AdCard({
    super.key,
    required this.ad,
    required this.isSaved,
    required this.isUpdating,
    required this.onToggleSaved,
  });

  @override
  Widget build(BuildContext context) {
    final price = double.tryParse(ad['price']?.toString() ?? '') ?? 0;

    final rating = double.tryParse(ad['avg_rating']?.toString() ?? '') ?? 0;

    final ratingCount = int.tryParse(ad['rating_count']?.toString() ?? '') ?? 0;

    final images = ad['image_urls'] is List
        ? List<dynamic>.from(ad['image_urls'] as List)
        : <dynamic>[];

    final firstName = ad['seller_first_name']?.toString().trim() ?? '';

    final lastName = ad['seller_last_name']?.toString().trim() ?? '';

    final sellerName = [
      firstName,
      lastName,
    ].where((part) => part.isNotEmpty).join(' ');

    final companyName = ad['company_name']?.toString().trim() ?? '';

    final location = ad['location']?.toString().trim() ?? '';

    final isVerified = ad['seller_verified'] == true;

    final hasSellerFooter = sellerName.isNotEmpty || companyName.isNotEmpty;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push(
          '/marketplace/ads/${ad['id']}',
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Container(
                    color: AppTheme.primaryColor.withValues(
                      alpha: 0.08,
                    ),
                    child: images.isNotEmpty
                        ? AppNetworkImage(
                            url: images.first.toString(),
                            fit: BoxFit.cover,
                            memCacheWidth: 700,
                            errorWidget: Center(
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
                    top: 6,
                    right: 6,
                    child: IconButton.filledTonal(
                      visualDensity: VisualDensity.compact,
                      tooltip: isSaved ? 'Remove from saved' : 'Save ad',
                      onPressed: isUpdating ? null : onToggleSaved,
                      icon: isUpdating
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                              ),
                            )
                          : Icon(
                              isSaved ? Icons.favorite : Icons.favorite_border,
                              size: 19,
                            ),
                    ),
                  ),
                  if (images.length > 1)
                    Positioned(
                      left: 8,
                      bottom: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(
                            alpha: 0.68,
                          ),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.photo_library_outlined,
                              size: 12,
                              color: Colors.white,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '${images.length}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                10,
                10,
                10,
                9,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    ad['title']?.toString() ?? '',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      height: 1.2,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    price > 0
                        ? 'GH₵ ${price.toStringAsFixed(2)}'
                        : 'Contact for price',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: context.isDarkMode
                          ? AppTheme.primaryLight
                          : AppTheme.primaryColor,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(
                        ratingCount > 0 ? Icons.star : Icons.star_border,
                        size: 12,
                        color: const Color(0xFFFFB300),
                      ),
                      const SizedBox(width: 3),
                      Text(
                        ratingCount > 0
                            ? '${rating.toStringAsFixed(1)} ($ratingCount)'
                            : 'New',
                        style: TextStyle(
                          color: context.appSecondaryText,
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (location.isNotEmpty) ...[
                        const Spacer(),
                        Icon(
                          Icons.location_on_outlined,
                          size: 11,
                          color: context.appSecondaryText,
                        ),
                        const SizedBox(width: 2),
                        Flexible(
                          child: Text(
                            location,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: context.appSecondaryText,
                              fontSize: 9,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            if (hasSellerFooter) ...[
              Divider(
                height: 1,
                thickness: 1,
                color: Theme.of(context).dividerColor.withValues(alpha: 0.45),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  10,
                  7,
                  10,
                  8,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (sellerName.isNotEmpty)
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              sellerName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          if (isVerified) ...[
                            const SizedBox(width: 3),
                            const Icon(
                              Icons.verified,
                              size: 12,
                              color: Colors.blue,
                            ),
                          ],
                        ],
                      ),
                    if (companyName.isNotEmpty) ...[
                      if (sellerName.isNotEmpty) const SizedBox(height: 2),
                      Text(
                        companyName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: context.appSecondaryText,
                          fontSize: 9,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
