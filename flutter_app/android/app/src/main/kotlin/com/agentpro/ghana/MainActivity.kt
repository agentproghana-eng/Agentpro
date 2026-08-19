package com.agentpro.ghana

import android.app.KeyguardManager
import android.content.Context
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private val USSD_CHANNEL = "com.agentpro.ghana/ussd"
    private val SIM_CHANNEL = "com.agentpro.ghana/sim"
    private val USSD_ACCESSIBILITY_CHANNEL = "com.agentpro.ghana/ussd_accessibility"
    private val DEVICE_CLOCK_CHANNEL = "com.agentpro.ghana/device_clock"
    private val DEVICE_SECURITY_CHANNEL = "com.agentpro.ghana/device_security"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Register USSD automation channel
        USSDMethodChannel(this, flutterEngine.dartExecutor.binaryMessenger)
            .register(USSD_CHANNEL)

        // Register SIM info channel
        SimInfoChannel(this, flutterEngine.dartExecutor.binaryMessenger)
            .register(SIM_CHANNEL)

        // Register USSD Accessibility Service channel (MTN Cash In pilot)
        UssdAccessibilityChannel(this)
            .register(flutterEngine.dartExecutor.binaryMessenger, USSD_ACCESSIBILITY_CHANNEL)

        // Monotonic Android clock used for bounded offline transaction trust.
        DeviceClockChannel(this)
            .register(
                flutterEngine.dartExecutor.binaryMessenger,
                DEVICE_CLOCK_CHANNEL,
            )

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            DEVICE_SECURITY_CHANNEL
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "isDeviceSecure" -> {
                    val keyguardManager =
                        getSystemService(Context.KEYGUARD_SERVICE)
                            as KeyguardManager
                    result.success(keyguardManager.isDeviceSecure)
                }
                else -> result.notImplemented()
            }
        }
    }
}
