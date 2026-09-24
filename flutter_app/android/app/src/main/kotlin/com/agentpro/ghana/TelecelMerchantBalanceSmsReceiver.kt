package com.agentpro.ghana

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.telephony.SubscriptionManager
import java.security.MessageDigest

class TelecelMerchantBalanceSmsReceiver : BroadcastReceiver() {

    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        if (
            intent.action !=
            Telephony.Sms.Intents.SMS_RECEIVED_ACTION
        ) {
            return
        }

        val messages =
            Telephony.Sms.Intents.getMessagesFromIntent(intent)

        if (messages.isEmpty()) {
            return
        }

        val body = messages
            .joinToString(separator = "") {
                it.messageBody ?: ""
            }
            .trim()

        if (body.isEmpty()) {
            return
        }

        val observation =
            TelecelMerchantBalanceSmsParser.parse(body)
                ?: return

        val receivedAtMillis = messages
            .map { it.timestampMillis }
            .filter { it > 0L }
            .minOrNull()
            ?: return

        /*
         * Android SMS broadcasts may expose the receiving subscription
         * under platform/OEM-specific extras. Resolve it defensively.
         *
         * If no exact active subscription can be established, fail closed.
         */
        val subscriptionId =
            SmsSubscriptionResolver.resolve(intent)
                ?: return

        val simIdentity =
            resolveExactTelecelSim(
                context,
                subscriptionId,
            ) ?: return

        /*
         * Never persist the SMS body.
         *
         * This digest is only an opaque local replay identifier. The
         * backend must still authenticate the user/device and verify the
         * exact Merchant wallet before accepting an observation.
         */
        val sourceReference = sha256(
            listOf(
                subscriptionId.toString(),
                receivedAtMillis.toString(),
                observation.merchantAccountBalance
                    .toPlainString(),
                observation.workingAccountBalance
                    .toPlainString(),
            ).joinToString("|")
        )

        TelecelMerchantBalanceSmsStore.record(
            context = context,
            observation =
                TelecelMerchantBalanceSmsStore.PendingObservation(
                    sourceReference = sourceReference,
                    receivedAtMillis = receivedAtMillis,
                    subscriptionId = subscriptionId,
                    simSlot = simIdentity.simSlotIndex,
                    simIccid = simIdentity.iccId
                        ?.trim()
                        .orEmpty(),
                    merchantAccountBalance =
                        observation.merchantAccountBalance
                            .toPlainString(),
                    workingAccountBalance =
                        observation.workingAccountBalance
                            .toPlainString(),
                ),
        )
    }

    private fun resolveExactTelecelSim(
        context: Context,
        subscriptionId: Int,
    ): android.telephony.SubscriptionInfo? {
        val manager =
            context.getSystemService(
                Context.TELEPHONY_SUBSCRIPTION_SERVICE
            ) as? SubscriptionManager
                ?: return null

        val subscriptions = try {
            manager.activeSubscriptionInfoList
                ?: emptyList()
        } catch (_: SecurityException) {
            return null
        }

        val match =
            subscriptions.singleOrNull {
                it.subscriptionId == subscriptionId
            } ?: return null

        val operator =
            if (Build.VERSION.SDK_INT >=
                Build.VERSION_CODES.Q
            ) {
                match.mccString.orEmpty() +
                    match.mncString.orEmpty()
            } else {
                @Suppress("DEPRECATION")
                "${match.mcc}${match.mnc}"
            }

        // Ghana Telecel/Vodafone network identity.
        if (operator != "62002") {
            return null
        }

        return match
    }

    private fun sha256(value: String): String {
        val bytes =
            MessageDigest.getInstance("SHA-256")
                .digest(value.toByteArray(Charsets.UTF_8))

        return bytes.joinToString("") {
            "%02x".format(it)
        }
    }
}
