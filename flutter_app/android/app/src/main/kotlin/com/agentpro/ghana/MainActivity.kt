package com.agentpro.ghana

import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private val USSD_CHANNEL = "com.agentpro.ghana/ussd"
    private val SIM_CHANNEL = "com.agentpro.ghana/sim"
    private val USSD_ACCESSIBILITY_CHANNEL = "com.agentpro.ghana/ussd_accessibility"

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
    }
}
