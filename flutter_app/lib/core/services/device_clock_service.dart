import 'package:flutter/services.dart';

class DeviceClockSnapshot {
  final int elapsedRealtimeMs;
  final int bootCount;

  const DeviceClockSnapshot({
    required this.elapsedRealtimeMs,
    required this.bootCount,
  });
}

class DeviceClockService {
  static const MethodChannel _channel = MethodChannel(
    'com.agentpro.ghana/device_clock',
  );

  static Future<DeviceClockSnapshot?> snapshot() async {
    try {
      final raw = await _channel.invokeMethod<dynamic>(
        'snapshot',
      );

      if (raw is! Map) return null;

      final rawElapsed = raw['elapsed_realtime_ms'];
      final rawBootCount = raw['boot_count'];

      if (rawElapsed is! num || rawBootCount is! num) {
        return null;
      }

      final elapsed = rawElapsed.toInt();
      final bootCount = rawBootCount.toInt();

      if (elapsed < 0 || bootCount < 0) {
        return null;
      }

      return DeviceClockSnapshot(
        elapsedRealtimeMs: elapsed,
        bootCount: bootCount,
      );
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    } catch (_) {
      return null;
    }
  }
}
