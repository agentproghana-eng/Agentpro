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
 * Bridges Flutter to UssdAccessibilityService for MTN Cash In/Out,
 * Telecel Deposit, and any generic flow defined via the USSD Flow
 * Builder.
 *
 * - Checks whether the accessibility service is enabled, and opens the
 *   system Accessibility Settings screen so the user can enable it (there
 *   is no one-tap grant for this on Android - it requires the user to
 *   navigate Settings themselves).
 * - Starts an automation session: stores the transaction params on the
 *   service, then places the actual outgoing call via Intent.ACTION_CALL
 *   (this is what makes Android show its own native USSD dialog, which
 *   the already-running accessibility service can then read and respond
 *   to - a DIFFERENT dial mechanism than USSDMethodChannel's
 *   sendUssdRequest(), which deliberately shows no dialog at all and is
 *   unsuitable for this multi-step flow). MTN/Telecel keep their
 *   hardcoded dial codes (*171# for MTN, *110# for Telecel); any other provider must supply
 *   dial_code explicitly, since it comes from that flow's own
 *   ussd_flows.dial_code column, not a fixed lookup here.
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

    // Parses the "steps" argument (a List<Map<*, *>> as delivered by
    // Flutter's standard MethodChannel codec) into typed FlowStep
    // objects. Returns null (not an empty list) if no steps were
    // supplied at all - this distinction matters, since
    // UssdAccessibilityService treats "steps == null" as "this is an
    // MTN/Telecel hardcoded session, not a generic one".
    @Suppress("UNCHECKED_CAST")
    private fun parseSteps(call: MethodCall): List<UssdAccessibilityService.FlowStep>? {
        val raw = call.argument<List<Map<String, Any?>>>("steps") ?: return null
        return raw.map { stepMap ->
            val matchAll = (stepMap["match_all"] as? List<*>)?.map { it.toString() } ?: emptyList()
            val action = stepMap["action"] as? String ?: ""
            val actionValue = stepMap["action_value"] as? String
            UssdAccessibilityService.FlowStep(matchAll, action, actionValue)
        }
    }

    private fun startAutomation(call: MethodCall, result: MethodChannel.Result) {
        val customerPhone = call.argument<String>("customer_phone")
        val amount = call.argument<String>("amount")
        val transactionType = call.argument<String>("transaction_type")
        val provider = call.argument<String>("provider") ?: "mtn"
        val operatorId = call.argument<String>("operator_id")
        val reference = call.argument<String>("reference")
        val explicitDialCode = call.argument<String>("dial_code")
        val steps = parseSteps(call)
        val successMarkers = call.argument<List<String>>("success_markers")
        val failureMarkers = call.argument<List<String>>("failure_markers")

        if (customerPhone == null || amount == null || transactionType == null) {
            result.error("INVALID_ARGS", "customer_phone and amount are required", null)
            return
        }

        if (provider == "telecel" && operatorId.isNullOrBlank()) {
            result.error("MISSING_OPERATOR_ID", "Telecel Operator ID is required - set it in USSD Automation settings", null)
            return
        }

        // Generic flows (provider not mtn/telecel) must supply their own
        // dial code, since there's no hardcoded lookup for them.
        if (provider != "mtn" && provider != "telecel" && explicitDialCode.isNullOrBlank()) {
            result.error("MISSING_DIAL_CODE", "dial_code is required for provider: $provider", null)
            return
        }

        if (!isServiceEnabled()) {
            result.error("SERVICE_DISABLED", "Accessibility service is not enabled", null)
            return
        }

        UssdAccessibilityService.startSession(
            customerPhone, amount, transactionType, provider, operatorId, reference,
            steps, successMarkers, failureMarkers
        )

        val dialCode = explicitDialCode ?: if (provider == "telecel") "*110#" else "*171#"

        try {
            val dialIntent = Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(dialCode)))
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

    override fun onResult(outcome: String, message: String) {
        val args = HashMap<String, Any>()
        args["outcome"] = outcome
        args["message"] = message
        channel.invokeMethod("onResult", args)
    }

    // TEMPORARY DIAGNOSTIC - remove once we understand why some
    // OEM-styled MTN dialogs aren't being recognized.
    override fun onDebugScreenText(text: String, sessionActive: Boolean) {
        val args = HashMap<String, Any>()
        args["text"] = text
        args["sessionActive"] = sessionActive
        channel.invokeMethod("onDebugScreenText", args)
    }
}
