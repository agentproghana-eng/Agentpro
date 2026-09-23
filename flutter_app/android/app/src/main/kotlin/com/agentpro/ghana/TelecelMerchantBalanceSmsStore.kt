package com.agentpro.ghana

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object TelecelMerchantBalanceSmsStore {
    private const val PREFS =
        "telecel_merchant_balance_sms"

    private const val PENDING =
        "pending_observations"

    data class PendingObservation(
        val sourceReference: String,
        val receivedAtMillis: Long,
        val subscriptionId: Int,
        val simSlot: Int,
        val simIccid: String,
        val merchantAccountBalance: String,
        val workingAccountBalance: String,
    )

    /*
     * Persistent FIFO ledger for parsed Telecel Merchant balance
     * observations.
     *
     * Financial observations are never evicted merely because a newer SMS
     * arrived. They remain until the authenticated backend reconciliation
     * path accepts them and Flutter explicitly acknowledges that exact
     * source reference.
     *
     * No SMS body, sender text, PIN, Operator ID, or shortcode is stored.
     */
    @Synchronized
    fun record(
        context: Context,
        observation: PendingObservation,
    ): Boolean {
        val observations = pending(context).toMutableList()

        /*
         * sourceReference is the local replay identity. Receiving the same
         * SMS broadcast again must not create another queue entry.
         */
        if (
            observations.any {
                it.sourceReference ==
                    observation.sourceReference
            }
        ) {
            return false
        }

        observations.add(observation)

        persist(
            context,
            observations.sortedWith(
                compareBy<PendingObservation> {
                    it.receivedAtMillis
                }.thenBy {
                    it.sourceReference
                },
            ),
        )

        return true
    }

    @Synchronized
    fun pending(
        context: Context,
    ): List<PendingObservation> {
        val raw =
            context
                .getSharedPreferences(
                    PREFS,
                    Context.MODE_PRIVATE,
                )
                .getString(PENDING, null)
                ?: return emptyList()

        return try {
            val array = JSONArray(raw)
            val observations =
                mutableListOf<PendingObservation>()

            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index)
                    ?: continue

                val observation =
                    decode(item)
                        ?: continue

                observations.add(observation)
            }

            observations.sortedWith(
                compareBy<PendingObservation> {
                    it.receivedAtMillis
                }.thenBy {
                    it.sourceReference
                },
            )
        } catch (_: Exception) {
            /*
             * Fail closed on malformed local state. Do not erase it here;
             * preserving the bytes is safer than silently destroying
             * potentially recoverable financial evidence.
             */
            emptyList()
        }
    }

    @Synchronized
    fun acknowledge(
        context: Context,
        sourceReference: String,
    ): Boolean {
        val normalizedReference =
            sourceReference.trim()

        if (normalizedReference.isEmpty()) {
            return false
        }

        val observations = pending(context)

        val remaining =
            observations.filterNot {
                it.sourceReference ==
                    normalizedReference
            }

        if (remaining.size == observations.size) {
            return false
        }

        persist(context, remaining)

        return true
    }

    private fun persist(
        context: Context,
        observations: List<PendingObservation>,
    ) {
        val array = JSONArray()

        observations.forEach { observation ->
            array.put(encode(observation))
        }

        context
            .getSharedPreferences(
                PREFS,
                Context.MODE_PRIVATE,
            )
            .edit()
            .putString(
                PENDING,
                array.toString(),
            )
            /*
             * commit() is intentional. BroadcastReceiver persistence must
             * finish before record() returns; a process death immediately
             * after receiving the SMS must not lose an accepted observation.
             */
            .commit()
    }

    private fun encode(
        observation: PendingObservation,
    ): JSONObject =
        JSONObject()
            .put(
                "source_reference",
                observation.sourceReference,
            )
            .put(
                "received_at_millis",
                observation.receivedAtMillis,
            )
            .put(
                "subscription_id",
                observation.subscriptionId,
            )
            .put(
                "sim_slot",
                observation.simSlot,
            )
            .put(
                "sim_iccid",
                observation.simIccid,
            )
            .put(
                "merchant_account_balance",
                observation.merchantAccountBalance,
            )
            .put(
                "working_account_balance",
                observation.workingAccountBalance,
            )

    private fun decode(
        item: JSONObject,
    ): PendingObservation? {
        val sourceReference =
            item.optString(
                "source_reference",
                "",
            ).trim()

        val receivedAtMillis =
            item.optLong(
                "received_at_millis",
                -1L,
            )

        val subscriptionId =
            item.optInt(
                "subscription_id",
                -1,
            )

        val simSlot =
            item.optInt(
                "sim_slot",
                -1,
            )

        if (
            sourceReference.isEmpty() ||
            receivedAtMillis <= 0L ||
            subscriptionId < 0 ||
            simSlot < 0
        ) {
            return null
        }

        val merchantAccountBalance =
            item.optString(
                "merchant_account_balance",
                "",
            ).trim()

        val workingAccountBalance =
            item.optString(
                "working_account_balance",
                "",
            ).trim()

        if (
            merchantAccountBalance.isEmpty() ||
            workingAccountBalance.isEmpty()
        ) {
            return null
        }

        return PendingObservation(
            sourceReference = sourceReference,
            receivedAtMillis = receivedAtMillis,
            subscriptionId = subscriptionId,
            simSlot = simSlot,
            simIccid =
                item.optString(
                    "sim_iccid",
                    "",
                ).trim(),
            merchantAccountBalance =
                merchantAccountBalance,
            workingAccountBalance =
                workingAccountBalance,
        )
    }
}
