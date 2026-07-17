package com.agentpro.ghana

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Bridges Flutter to UssdAccessibilityService for the MTN Cash In pilot.
 *
 * - Checks whether the accessibility service is enabled, and opens the
 *   system Accessibility Settings screen so the user can enable it (there
 *   is no one-tap grant for this on Android - it requires the user to
 *   navigate Settings themselves).
 * - Starts an automation session: stores the transaction params on the
 * service, then places the actual outgoing call to *171# via
 *   Intent.ACTION_CALL (this is what makes Android show its own native
 *   USSD dialog, which the already-running accessibility service can
 *   then read and respond to - a DIFFERENT dial mechanism than
 *   USSDMethodChannel's sendUssdRequest(), which deliberately shows no
 *   dialog at all and is unsuitable for this multi-step flow).
 * - Forwards progress (PIN prompt reached, final result) back to
 *   Flutter via this same channel's invokeMethod, since those events
 *   originate from the service asynchronously, not from a direct
 *   Flutter call.
 */
class UssdAccessibilityChannel(
    private val context: Context
) : MethodChannel.MethodCallHandler, UssdAccessibilityService.UssdAccessibilityListener {

    private lateinit var channel: MethodChannel

    fun register(messenger: BinaryMessenger, channelName: String) {
        channel = MethodChannel(messenger, channelName)
        channel.setMethodCallHandler(this)
        UssdAccessibilityService.listener = this
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "isServiceEnabled" -> result.success(isServiceEnabled())
            "openAccessibilitySettings" -> {
                openAccessibilitySettings()
                result.success(null)
            }
            "startAutomation" -> startAutomation(call, result)
            else -> result.notImplemented()
        }
    }

    private fun isServiceEnabled(): Boolean {
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val enabledServices = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
        return enabledServices.any {
            it.resolveInfo.serviceInfo.packageName == context.packageName &&
                it.resolveInfo.serviceInfo.name == UssdAccessibilityService::class.java.name
        }
    }

    private fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    private fun startAutomation(call: MethodCall, result: MethodChannel.Result) {
        val customerPhone = call.argument<String>("customer_phone")
        val amount = call.argument<String>("amount")
        val transactionType = call.argument<String>("transaction_type")

        if (customerPhone == null || amount == null || transactionType == null) {
            result.error("INVALID_ARGS", "customer_phone and amount are required", null)
            return
        }

        if (!isServiceEnabled()) {
            result.error("SERVICE_DISABLED", "Accessibility service is not enabled", null)
            return
        }

        UssdAccessibilityService.startSession(customerPhone, amount, transactionType)

        try {
            val dialIntent = Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode("*171#")))
            dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(dialIntent)
            result.success(true)
        } catch (e: SecurityException) {
            UssdAccessibilityService.endSession()
            result.error("PERMISSION_DENIED", "CALL_PHONE permission is required", null)
        } catch (e: Exception) {
            UssdAccessibilityService.endSession()
            result.error("DIAL_ERROR", e.message, null)
        }
    }

    override fun onPinPromptReached() {
        channel.invokeMethod("onPinPromptReached", null)
    }

    override fun onResult(success: Boolean, message: String) {
        val args = HashMap<String, Any>()
        args["success"] = success
        args["message"] = message
        channel.invokeMethod("onResult", args)
    }
}
