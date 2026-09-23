package com.agentpro.ghana

import android.content.Context
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Read/ack boundary for parsed Telecel Merchant balance observations.
 *
 * Flutter can:
 *   1. read observations already accepted by the native SMS parser; and
 *   2. acknowledge one exact source reference after backend acceptance.
 *
 * Flutter cannot create, edit, replace, or inject an observation through
 * this channel.
 */
class TelecelMerchantBalanceSmsChannel(
    context: Context,
) : MethodChannel.MethodCallHandler {
    private val appContext =
        context.applicationContext

    fun register(
        messenger: BinaryMessenger,
        channelName: String,
    ) {
        MethodChannel(
            messenger,
            channelName,
        ).setMethodCallHandler(this)
    }

    override fun onMethodCall(
        call: MethodCall,
        result: MethodChannel.Result,
    ) {
        when (call.method) {
            "getPendingTelecelMerchantBalanceObservations" -> {
                val observations =
                    TelecelMerchantBalanceSmsStore
                        .pending(appContext)
                        .map { observation ->
                            mapOf(
                                "source_reference" to
                                    observation.sourceReference,
                                "received_at_millis" to
                                    observation.receivedAtMillis,
                                "subscription_id" to
                                    observation.subscriptionId,
                                "sim_slot" to
                                    observation.simSlot,
                                "sim_iccid" to
                                    observation.simIccid,
                                "merchant_account_balance" to
                                    observation.merchantAccountBalance,
                                "working_account_balance" to
                                    observation.workingAccountBalance,
                            )
                        }

                result.success(observations)
            }

            "acknowledgeTelecelMerchantBalanceObservation" -> {
                val sourceReference =
                    call.argument<String>(
                        "source_reference",
                    )?.trim()

                if (sourceReference.isNullOrEmpty()) {
                    result.error(
                        "INVALID_SOURCE_REFERENCE",
                        "source_reference is required.",
                        null,
                    )
                    return
                }

                val acknowledged =
                    TelecelMerchantBalanceSmsStore
                        .acknowledge(
                            context = appContext,
                            sourceReference =
                                sourceReference,
                        )

                result.success(acknowledged)
            }

            else -> result.notImplemented()
        }
    }
}
