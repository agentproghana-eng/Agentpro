package com.agentpro.ghana

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import android.annotation.SuppressLint
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telephony.SubscriptionManager
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
            "dialManual" -> dialManual(call, result)
            "startAutomation" -> startAutomation(call, result)
            "cancelAutomation" -> {
                UssdAccessibilityService.endSession()
                UssdForegroundService.stop(context)
                result.success(null)
            }
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

    // Resolves which PhoneAccountHandle corresponds to a physical SIM
    // slot, so the outgoing call intent can be pinned to the right SIM
    // instead of falling back to the device's default calling SIM (or
    // triggering the native "Call with" picker, which this automation
    // can't read). Primary match relies on the fact that on stock/AOSP
    // telecom stacks a SIM-backed PhoneAccountHandle's id is the
    // subscription id itself; falls back to positional match against
    // callCapablePhoneAccounts (slot-ordered on virtually all devices)
    // if that assumption doesn't hold on a given OEM stack.
    @SuppressLint("MissingPermission")
    private fun phoneAccountHandleForSimSlot(simSlot: Int): PhoneAccountHandle? {
        val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
            ?: return null
        val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            ?: return null

        val subInfo = subscriptionManager.getActiveSubscriptionInfoForSimSlotIndex(simSlot) ?: return null
        val targetSubId = subInfo.subscriptionId.toString()

        val handles = telecomManager.callCapablePhoneAccounts

        handles.firstOrNull { it.id == targetSubId }?.let { return it }
        return handles.getOrNull(simSlot)
    }

    // Opens the real provider USSD menu without starting an Accessibility
    // automation session. This is the Free-Personal path: AgentPro selects
    // the correct SIM and places the call, while every menu choice and PIN
    // entry remains entirely manual on the network-owned screen.
    private fun dialManual(call: MethodCall, result: MethodChannel.Result) {
        val dialCode = call.argument<String>("dial_code")
        val simSlot = call.argument<Int>("sim_slot")

        if (dialCode.isNullOrBlank()) {
            result.error("INVALID_ARGS", "dial_code is required", null)
            return
        }

        try {
            val phoneAccountHandle = if (simSlot != null) {
                phoneAccountHandleForSimSlot(simSlot)
            } else {
                null
            }

            // TransactionDevicePreparationService has already verified the
            // physical SIM. If Android cannot map that verified slot to an
            // outgoing PhoneAccountHandle, fail closed instead of silently
            // falling back to the device's default SIM or SIM picker.
            if (simSlot != null && phoneAccountHandle == null) {
                result.error(
                    "SIM_UNAVAILABLE",
                    "The selected SIM is unavailable for dialing",
                    null
                )
                return
            }

            val dialIntent = Intent(
                Intent.ACTION_CALL,
                Uri.parse("tel:" + Uri.encode(dialCode))
            )
            dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

            phoneAccountHandle?.let { handle ->
                dialIntent.putExtra(
                    TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE,
                    handle
                )
            }

            context.startActivity(dialIntent)
            result.success(true)
        } catch (e: SecurityException) {
            result.error(
                "PERMISSION_DENIED",
                "CALL_PHONE permission is required",
                null
            )
        } catch (e: Exception) {
            result.error("DIAL_ERROR", e.message, null)
        }
    }

    private fun startAutomation(call: MethodCall, result: MethodChannel.Result) {
        val customerPhone = call.argument<String>("customer_phone")
        val amount = call.argument<String>("amount")
        val transactionType = call.argument<String>("transaction_type")
        val provider = call.argument<String>("provider")
        val operatorId = call.argument<String>("operator_id")
        val reference = call.argument<String>("reference")
        val merchantId = call.argument<String>("merchant_id")
        val explicitDialCode = call.argument<String>("dial_code")
        val simSlot = call.argument<Int>("sim_slot")
        val steps = parseSteps(call)
        val selections = call.argument<Map<String, Any>>("selections")?.mapValues { it.value.toString() }
        val successMarkers = call.argument<List<String>>("success_markers")
        val failureMarkers = call.argument<List<String>>("failure_markers")

        if (transactionType.isNullOrBlank()) {
            result.error(
                "INVALID_ARGS",
                "transaction_type is required",
                null
            )
            return
        }

        if (provider.isNullOrBlank()) {
            result.error(
                "INVALID_ARGS",
                "provider is required",
                null
            )
            return
        }

        // Data-driven flows declare which transaction values they actually
        // consume through their step actions. Do not require customer_phone
        // or amount globally: balance enquiries and future flow types may
        // legitimately use neither.
        //
        // The legacy hardcoded path still requires both because its MTN /
        // Telecel branches explicitly send customer phone and amount.
        val needsCustomerPhone = if (steps != null) {
            steps.any { it.action == "send_customer_phone" }
        } else {
            true
        }

        val needsAmount = if (steps != null) {
            steps.any { it.action == "send_amount" }
        } else {
            true
        }

        val needsReference = if (steps != null) {
            steps.any { it.action == "send_reference" }
        } else {
            false
        }

        // send_selection values are indexed by the actual flow-step index.
        // Validate every required selection before dialing so a malformed or
        // stale client payload cannot enter the USSD session and stall later.
        if (steps != null) {
            val missingSelectionIndex = steps.withIndex()
                .firstOrNull { (index, step) ->
                    step.action == "send_selection" &&
                        selections?.get(index.toString()).isNullOrBlank()
                }
                ?.index

            if (missingSelectionIndex != null) {
                result.error(
                    "MISSING_SELECTION",
                    "A selection is required for USSD flow step $missingSelectionIndex",
                    null
                )
                return
            }
        }

        if (needsCustomerPhone && customerPhone.isNullOrBlank()) {
            result.error(
                "MISSING_CUSTOMER_PHONE",
                "customer_phone is required by this USSD flow",
                null
            )
            return
        }

        if (needsAmount && amount.isNullOrBlank()) {
            result.error(
                "MISSING_AMOUNT",
                "amount is required by this USSD flow",
                null
            )
            return
        }

        if (needsReference && reference.isNullOrBlank()) {
            result.error(
                "MISSING_REFERENCE",
                "reference is required by this USSD flow",
                null
            )
            return
        }

        // Operator ID is only actually used by flows whose own steps
        // include a send_operator_id action (Telecel Airtime, which
        // sends it to a specific USSD prompt) - it was previously
        // required for every Telecel transaction regardless, which
        // incorrectly blocked flows that never reference it at all
        // (e.g. Send Money Same Network) and have no reason to expect
        // a Personal account to have ever set this Agent-only value.
        // steps == null means the legacy hardcoded path is in use
        // (see parseSteps below), which still needs the old blanket
        // check since that path's own logic assumes it's set.
        val needsOperatorId = if (steps != null) {
            steps.any { it.action == "send_operator_id" }
        } else {
            provider == "telecel"
        }
        if (needsOperatorId && operatorId.isNullOrBlank()) {
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
            customerPhone, amount, transactionType, provider, operatorId, reference, merchantId,
            steps, selections, successMarkers, failureMarkers
        )
        UssdForegroundService.start(context)

        val dialCode = explicitDialCode ?: if (provider == "telecel") "*110#" else "*171#"

        try {
            val dialIntent = Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(dialCode)))
            dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (simSlot != null) {
                phoneAccountHandleForSimSlot(simSlot)?.let { handle ->
                    dialIntent.putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle)
                }
            }
            context.startActivity(dialIntent)
            result.success(true)
        } catch (e: SecurityException) {
            UssdAccessibilityService.endSession()
            UssdForegroundService.stop(context)
            result.error("PERMISSION_DENIED", "CALL_PHONE permission is required", null)
        } catch (e: Exception) {
            UssdAccessibilityService.endSession()
            UssdForegroundService.stop(context)
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
}
