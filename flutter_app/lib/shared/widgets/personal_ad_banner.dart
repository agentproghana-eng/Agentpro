// personal_ad_banner.dart
import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

/// Free-tier-only banner shown at the bottom of Personal Home.
/// Debug/profile development uses Google's public test banner ID,
/// while release builds use AgentPro's production AdMob banner unit.
/// Failed ad loads render nothing so advertising never breaks the
/// surrounding Personal Home experience.
class PersonalAdBanner extends StatefulWidget {
  const PersonalAdBanner({super.key});
  @override
  State<PersonalAdBanner> createState() => _PersonalAdBannerState();
}

class _PersonalAdBannerState extends State<PersonalAdBanner> {
  BannerAd? _bannerAd;
  bool _isLoaded = false;

  static const _testAdUnitId =
      'ca-app-pub-3940256099942544/6300978111';
  static const _productionAdUnitId =
      'ca-app-pub-9807693896377158/7201843290';

  static String get _adUnitId =>
      const bool.fromEnvironment('dart.vm.product')
          ? _productionAdUnitId
          : _testAdUnitId;

  @override
  void initState() {
    super.initState();
    _loadAd();
  }

  void _loadAd() {
    _bannerAd = BannerAd(
      adUnitId: _adUnitId,
      size: AdSize.largeBanner,
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (ad) {
          if (mounted) setState(() => _isLoaded = true);
        },
        onAdFailedToLoad: (ad, error) {
          ad.dispose();
        },
      ),
    )..load();
  }

  @override
  void dispose() {
    _bannerAd?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_isLoaded || _bannerAd == null) return const SizedBox.shrink();
    return Container(
      alignment: Alignment.center,
      width: _bannerAd!.size.width.toDouble(),
      height: _bannerAd!.size.height.toDouble(),
      child: AdWidget(ad: _bannerAd!),
    );
  }
}
