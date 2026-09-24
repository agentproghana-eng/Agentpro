package com.agentpro.ghana

import android.content.Intent
import android.telephony.SubscriptionManager

/**
 * Resolves the receiving Android subscription from an SMS broadcast.
 *
 * Financial safety rule:
 * - no recognized valid subscription -> fail closed
 * - exactly one distinct valid subscription -> accept
 * - recognized extras disagree -> fail closed
 *
 * Never guess by SIM slot, default subscription, or arrival order.
 */
object SmsSubscriptionResolver {
    private val candidateKeys = listOf(
        "subscription",
        "subscription_id",
        "android.telephony.extra.SUBSCRIPTION_INDEX",
        "android.telephony.extra.SUBSCRIPTION_ID",
    )

    fun resolve(intent: Intent): Int? {
        val candidates = candidateKeys
            .filter { intent.hasExtra(it) }
            .mapNotNull { key ->
                val value = intent.getIntExtra(
                    key,
                    SubscriptionManager.INVALID_SUBSCRIPTION_ID,
                )

                value.takeIf {
                    it >= 0 &&
                        it != SubscriptionManager.INVALID_SUBSCRIPTION_ID
                }
            }
            .distinct()

        return candidates.singleOrNull()
    }
}
