package com.agentpro.ghana

import android.content.Context
import android.os.Build
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.util.Log
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * SIM Card Information Channel
 *
 * Detects SIM slots and identifies which Mobile Money
 * network (MTN, Telecel, AT) is on each SIM.
 *
 * Used by USSD engine to auto-route USSD to the correct SIM.
 */
class SimInfoChannel(
    private val context: Context,
    private val messenger: BinaryMessenger
) : MethodChannel.MethodCallHandler {

    companion object {
        private const val TAG = "SimInfo"

        // Ghana network operator codes
        private val MTN_OPERATORS = setOf("62001")               // MTN Ghana
        private val TELECEL_OPERATORS = setOf("62002")            // Telecel (formerly Vodafone)
        private val AT_OPERATORS = setOf("62003", "62006")        // AirtelTigo (Tigo 62003, Airtel 62006)
    }

    fun register(channelName: String) {
        val channel = MethodChannel(messenger, channelName)
        channel.setMethodCallHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "getSimCards" -> getSimCards(result)
            "getSimSlotForProvider" -> getSimSlotForProvider(call, result)
            else -> result.notImplemented()
        }
    }

    private fun getSimCards(result: MethodChannel.Result) {
        try {
            val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE)
                as SubscriptionManager

            val subscriptions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                subscriptionManager.activeSubscriptionInfoList ?: emptyList()
            } else {
                emptyList<SubscriptionInfo>()
            }

            val simList = subscriptions.map { sub ->
                val operator = sub.mccString + sub.mncString
                mapOf(
                    "slot" to sub.simSlotIndex,
                    "subscription_id" to sub.subscriptionId,
                    "carrier_name" to sub.carrierName.toString(),
                    // NOTE: SubscriptionInfo.getNumber() deliberately omitted.
                    // On targetSdk 30+ (this app targets 34), READ_PHONE_STATE
                    // alone is no longer sufficient to read it — the SDK
                    // requires READ_PHONE_NUMBERS, READ_PRIVILEGED_PHONE_STATE,
                    // READ_SMS, carrier privileges, or default-SMS-handler
                    // status instead. None of those apply here, and nothing
                    // in this app actually needs the SIM's own subscriber
                    // number — USSD routing only needs `network` and `slot`
                    // below. Adding READ_PHONE_NUMBERS solely to populate an
                    // unused field isn't worth the extra permission prompt.
                    "network" to identifyNetwork(operator),
                    "operator_code" to operator,
                )
            }

            Log.d(TAG, "Found ${simList.size} SIM card(s)")
            result.success(simList)
        } catch (e: SecurityException) {
            result.error("PERMISSION_DENIED", "READ_PHONE_STATE permission required", null)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting SIM info: ${e.message}")
            result.error("SIM_ERROR", e.message, null)
        }
    }

    private fun getSimSlotForProvider(call: MethodCall, result: MethodChannel.Result) {
        val provider = call.argument<String>("provider") ?: ""

        try {
            val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE)
                as SubscriptionManager

            val subscriptions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                subscriptionManager.activeSubscriptionInfoList ?: emptyList()
            } else {
                emptyList<SubscriptionInfo>()
            }

            for (sub in subscriptions) {
                val operator = sub.mccString + sub.mncString
                val network = identifyNetwork(operator)
                if (network == provider) {
                    result.success(sub.simSlotIndex)
                    return
                }
            }

            // Provider not found — return default slot 0
            result.success(0)
        } catch (e: Exception) {
            result.success(0) // Fallback to slot 0
        }
    }

    private fun identifyNetwork(operatorCode: String): String {
        return when {
            MTN_OPERATORS.contains(operatorCode) -> "mtn"
            TELECEL_OPERATORS.contains(operatorCode) -> "telecel"
            AT_OPERATORS.contains(operatorCode) -> "at_money"
            else -> "unknown"
        }
    }
}
