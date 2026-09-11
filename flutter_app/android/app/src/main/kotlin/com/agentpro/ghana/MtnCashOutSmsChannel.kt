package com.agentpro.ghana

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.math.BigDecimal

/**
 * Control channel for MTN Cash Out SMS reconciliation.
 *
 * The SMS BroadcastReceiver and pending ledger are independent from any
 * individual Flutter transaction screen. This allows several Cash Outs to
 * remain pending while the agent starts new transactions.
 */
class MtnCashOutSmsChannel(
    private val activity: Activity
) : MethodChannel.MethodCallHandler {

    companion object {
        private const val REQUEST_RECEIVE_SMS = 7401

        @Volatile
        private var callbackChannel: MethodChannel? = null

        fun notifyMatchedReceiptAvailable() {
            callbackChannel?.invokeMethod(
                "onMatchedCashOutReceiptAvailable",
                null
            )
        }
    }

    private var pendingPermissionResult:
        MethodChannel.Result? = null

    fun register(
        messenger: BinaryMessenger,
        channelName: String
    ) {
        MethodChannel(
            messenger,
            channelName
        ).setMethodCallHandler(this)
    }

    override fun onMethodCall(
        call: MethodCall,
        result: MethodChannel.Result
    ) {
        when (call.method) {
            "hasReceiveSmsPermission" ->
                result.success(
                    hasReceiveSmsPermission()
                )

            "requestReceiveSmsPermission" ->
                requestReceiveSmsPermission(result)

            "armCashOutSmsSession" ->
                armSession(call, result)

            "markCashOutPinReached" -> {
                val pending =
                    MtnCashOutSmsStore
                        .promoteActiveAtPin(
                            activity.applicationContext,
                            System.currentTimeMillis()
                        )

                if (pending == null) {
                    result.error(
                        "SMS_SESSION_NOT_ACTIVE",
                        "No active MTN Cash Out exists.",
                        null
                    )
                } else {
                    result.success(
                        mapOf(
                            "transaction_id" to
                                pending.transactionId,
                            "pin_reached_at_millis" to
                                pending.pinReachedAtMillis
                        )
                    )
                }
            }

            "disarmCashOutSmsSession" -> {
                // Only cancel the currently active USSD attempt.
                // Previously handed-off pending Cash Outs remain in the
                // persistent ledger awaiting their own MTN receipt.
                MtnCashOutSmsStore.clearActive(
                    activity.applicationContext
                )
                result.success(null)
            }

            "getMatchedCashOutReceipts" -> {
                result.success(
                    MtnCashOutSmsStore
                        .matched(
                            activity.applicationContext
                        )
                        .map {
                            mapOf(
                                "transaction_id" to
                                    it.transactionId,
                                "network_reference" to
                                    it.networkReference,
                                "matched_at_millis" to
                                    it.matchedAtMillis
                            )
                        }
                )
            }

            "acknowledgeMatchedCashOutReceipt" -> {
                val transactionId =
                    call.argument<String>(
                        "transaction_id"
                    )?.trim()

                val networkReference =
                    call.argument<String>(
                        "network_reference"
                    )?.trim()

                if (
                    transactionId.isNullOrEmpty() ||
                    networkReference.isNullOrEmpty()
                ) {
                    result.error(
                        "INVALID_MATCH",
                        "Transaction ID and network reference are required.",
                        null
                    )
                    return
                }

                MtnCashOutSmsStore.acknowledgeMatch(
                    context =
                        activity.applicationContext,
                    transactionId =
                        transactionId,
                    networkReference =
                        networkReference
                )

                result.success(null)
            }

            else -> result.notImplemented()
        }
    }

    fun onRequestPermissionsResult(
        requestCode: Int,
        grantResults: IntArray
    ): Boolean {
        if (
            requestCode !=
            REQUEST_RECEIVE_SMS
        ) {
            return false
        }

        val callback =
            pendingPermissionResult

        pendingPermissionResult = null

        callback?.success(
            grantResults.isNotEmpty() &&
                grantResults[0] ==
                PackageManager.PERMISSION_GRANTED
        )

        return true
    }

    private fun armSession(
        call: MethodCall,
        result: MethodChannel.Result
    ) {
        if (!hasReceiveSmsPermission()) {
            result.error(
                "SMS_PERMISSION_REQUIRED",
                "SMS permission is required for MTN Cash Out confirmation.",
                null
            )
            return
        }

        val transactionId =
            call.argument<String>(
                "transaction_id"
            )?.trim()

        val rawAmount =
            call.argument<String>(
                "amount"
            )?.trim()

        val customerName =
            call.argument<String>(
                "customer_name"
            )?.trim()

        val amount = try {
            rawAmount?.let {
                BigDecimal(it)
                    .stripTrailingZeros()
            }
        } catch (_: NumberFormatException) {
            null
        }

        if (transactionId.isNullOrEmpty()) {
            result.error(
                "INVALID_TRANSACTION_ID",
                "Transaction ID is required.",
                null
            )
            return
        }

        if (
            amount == null ||
            amount <= BigDecimal.ZERO
        ) {
            result.error(
                "INVALID_AMOUNT",
                "A valid Cash Out amount is required.",
                null
            )
            return
        }

        MtnCashOutSmsStore.arm(
            context =
                activity.applicationContext,
            transactionId =
                transactionId,
            amount =
                amount,
            customerName =
                customerName
        )

        result.success(true)
    }

    private fun hasReceiveSmsPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.RECEIVE_SMS
        ) == PackageManager.PERMISSION_GRANTED

    private fun requestReceiveSmsPermission(
        result: MethodChannel.Result
    ) {
        if (hasReceiveSmsPermission()) {
            result.success(true)
            return
        }

        if (pendingPermissionResult != null) {
            result.error(
                "PERMISSION_REQUEST_IN_PROGRESS",
                "An SMS permission request is already in progress.",
                null
            )
            return
        }

        pendingPermissionResult = result

        ActivityCompat.requestPermissions(
            activity,
            arrayOf(
                Manifest.permission.RECEIVE_SMS
            ),
            REQUEST_RECEIVE_SMS
        )
    }
}
