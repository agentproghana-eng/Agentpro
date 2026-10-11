import 'package:flutter/foundation.dart';

/// Raised after Quick Action customization has been saved to the server, so
/// the home screens reload their tiles at once instead of waiting for an app
/// restart. Navigation returns stay cache-only; this fires only after a real
/// saved change.
class QuickActionRefresh {
  QuickActionRefresh._();

  static final ValueNotifier<int> tick = ValueNotifier<int>(0);

  static void notifySaved() => tick.value++;
}
