package com.agentpro.ghana

import android.app.Activity
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel

class DeviceClockChannel(
    private val activity: Activity,
) {
    fun register(
        messenger: BinaryMessenger,
        channelName: String,
    ) {
        MethodChannel(messenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "snapshot" -> {
                        val bootCount =
                            if (
                                Build.VERSION.SDK_INT >=
                                    Build.VERSION_CODES.N
                            ) {
                                Settings.Global.getInt(
                                    activity.contentResolver,
                                    Settings.Global.BOOT_COUNT,
                                    -1,
                                )
                            } else {
                                -1
                            }

                        result.success(
                            mapOf(
                                "elapsed_realtime_ms" to
                                    SystemClock.elapsedRealtime(),
                                "boot_count" to bootCount,
                            ),
                        )
                    }

                    else -> result.notImplemented()
                }
            }
    }
}
