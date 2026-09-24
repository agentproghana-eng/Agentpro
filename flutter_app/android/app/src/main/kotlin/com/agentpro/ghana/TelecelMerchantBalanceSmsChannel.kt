package com.agentpro.ghana

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
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
    private val activity: Activity,
) : MethodChannel.MethodCallHandler {
    companion object {
        private const val REQUEST_RECEIVE_SMS = 7402
    }

    private val appContext =
        activity.applicationContext

    private var pendingPermissionResult:
        MethodChannel.Result? = null

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
            "hasReceiveSmsPermission" ->
                result.success(
                    hasReceiveSmsPermission(),
                )

            "requestReceiveSmsPermission" ->
                requestReceiveSmsPermission(result)

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

    fun onRequestPermissionsResult(
        requestCode: Int,
        grantResults: IntArray,
    ): Boolean {
        if (requestCode != REQUEST_RECEIVE_SMS) {
            return false
        }

        val callback = pendingPermissionResult
        pendingPermissionResult = null

        callback?.success(
            grantResults.isNotEmpty() &&
                grantResults[0] ==
                PackageManager.PERMISSION_GRANTED,
        )

        return true
    }

    private fun hasReceiveSmsPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.RECEIVE_SMS,
        ) == PackageManager.PERMISSION_GRANTED

    private fun requestReceiveSmsPermission(
        result: MethodChannel.Result,
    ) {
        if (hasReceiveSmsPermission()) {
            result.success(true)
            return
        }

        if (pendingPermissionResult != null) {
            result.error(
                "PERMISSION_REQUEST_IN_PROGRESS",
                "An SMS permission request is already in progress.",
                null,
            )
            return
        }

        pendingPermissionResult = result

        ActivityCompat.requestPermissions(
            activity,
            arrayOf(Manifest.permission.RECEIVE_SMS),
            REQUEST_RECEIVE_SMS,
        )
    }
}
