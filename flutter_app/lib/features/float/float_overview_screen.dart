import 'package:flutter/material.dart';

import 'float_screen.dart';

/// Compatibility route for older links.
///
/// Business owners and managers now use the same branch-treasury Float
/// Balances experience. Keeping this wrapper means existing
/// `/float-overview` deep links continue to work without maintaining a
/// second implementation of the same business-float screen.
class FloatOverviewScreen extends StatelessWidget {
  const FloatOverviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const FloatScreen();
  }
}
