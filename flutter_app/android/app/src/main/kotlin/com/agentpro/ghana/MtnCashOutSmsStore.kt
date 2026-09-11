package com.agentpro.ghana

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal

object MtnCashOutSmsStore {
    private const val PREFS_NAME = "mtn_cashout_sms_v1"
    private const val KEY_ACTIVE = "active"
    private const val KEY_PENDING = "pending"
    private const val KEY_MATCHED = "matched"

    data class PendingEntry(
        val transactionId: String,
        val amount: BigDecimal,
        val customerName: String?,
        val pinReachedAtMillis: Long
    )

    data class MatchedReceipt(
        val transactionId: String,
        val networkReference: String,
        val matchedAtMillis: Long
    )

    fun arm(
        context: Context,
        transactionId: String,
        amount: BigDecimal,
        customerName: String?
    ) {
        val prefs = prefs(context)

        val active = JSONObject()
            .put("transaction_id", transactionId)
            .put("amount", amount.toPlainString())
            .put(
                "customer_name",
                customerName?.trim()?.takeIf { it.isNotEmpty() }
                    ?: JSONObject.NULL
            )

        prefs.edit()
            .putString(KEY_ACTIVE, active.toString())
            .apply()
    }

    fun promoteActiveAtPin(
        context: Context,
        nowMillis: Long
    ): PendingEntry? {
        val prefs = prefs(context)
        val raw = prefs.getString(KEY_ACTIVE, null)
            ?: return null

        val active = try {
            JSONObject(raw)
        } catch (_: Exception) {
            clearActive(context)
            return null
        }

        val transactionId =
            active.optString("transaction_id").trim()

        val amount = parseAmount(
            active.optString("amount")
        )

        if (transactionId.isEmpty() || amount == null) {
            clearActive(context)
            return null
        }

        val customerName =
            if (active.isNull("customer_name")) {
                null
            } else {
                active.optString("customer_name")
                    .trim()
                    .takeIf { it.isNotEmpty() }
            }

        val pending = readArray(
            prefs.getString(KEY_PENDING, null)
        )

        // Reaching the PIN boundary for the same transaction again is
        // idempotent. Never create duplicate pending ledger entries.
        val existing = (0 until pending.length())
            .mapNotNull { index ->
                pending.optJSONObject(index)
            }
            .firstOrNull {
                it.optString("transaction_id") ==
                    transactionId
            }

        val entry = if (existing != null) {
            PendingEntry(
                transactionId = transactionId,
                amount = amount,
                customerName = customerName,
                pinReachedAtMillis =
                    existing.optLong(
                        "pin_reached_at_millis",
                        nowMillis
                    )
            )
        } else {
            pending.put(
                JSONObject()
                    .put("transaction_id", transactionId)
                    .put("amount", amount.toPlainString())
                    .put(
                        "customer_name",
                        customerName ?: JSONObject.NULL
                    )
                    .put(
                        "pin_reached_at_millis",
                        nowMillis
                    )
            )

            prefs.edit()
                .putString(KEY_PENDING, pending.toString())
                .remove(KEY_ACTIVE)
                .apply()

            PendingEntry(
                transactionId = transactionId,
                amount = amount,
                customerName = customerName,
                pinReachedAtMillis = nowMillis
            )
        }

        if (existing != null) {
            prefs.edit()
                .remove(KEY_ACTIVE)
                .apply()
        }

        return entry
    }

    fun clearActive(context: Context) {
        prefs(context).edit()
            .remove(KEY_ACTIVE)
            .apply()
    }

    fun pending(
        context: Context
    ): List<PendingEntry> {
        val array = readArray(
            prefs(context).getString(KEY_PENDING, null)
        )

        return (0 until array.length())
            .mapNotNull { index ->
                val item = array.optJSONObject(index)
                    ?: return@mapNotNull null

                val transactionId =
                    item.optString("transaction_id").trim()

                val amount =
                    parseAmount(item.optString("amount"))
                        ?: return@mapNotNull null

                val pinReachedAt =
                    item.optLong(
                        "pin_reached_at_millis",
                        0L
                    )

                if (
                    transactionId.isEmpty() ||
                    pinReachedAt <= 0L
                ) {
                    return@mapNotNull null
                }

                val customerName =
                    if (item.isNull("customer_name")) {
                        null
                    } else {
                        item.optString("customer_name")
                            .trim()
                            .takeIf { it.isNotEmpty() }
                    }

                PendingEntry(
                    transactionId = transactionId,
                    amount = amount,
                    customerName = customerName,
                    pinReachedAtMillis = pinReachedAt
                )
            }
    }

    fun recordMatched(
        context: Context,
        transactionId: String,
        networkReference: String,
        matchedAtMillis: Long
    ): Boolean {
        val prefs = prefs(context)

        val matched = readArray(
            prefs.getString(KEY_MATCHED, null)
        )

        val duplicate = (0 until matched.length())
            .mapNotNull { matched.optJSONObject(it) }
            .any {
                it.optString("network_reference") ==
                    networkReference
            }

        if (duplicate) {
            // A Financial Transaction ID can confirm only one Cash Out.
            // Never let a delayed duplicate receipt consume a newer pending
            // transaction that happens to have the same amount.
            return false
        }

        matched.put(
            JSONObject()
                .put(
                    "transaction_id",
                    transactionId
                )
                .put(
                    "network_reference",
                    networkReference
                )
                .put(
                    "matched_at_millis",
                    matchedAtMillis
                )
                .put(
                    "acknowledged",
                    false
                )
        )

        val pending = readArray(
            prefs.getString(KEY_PENDING, null)
        )

        val remaining = JSONArray()

        for (index in 0 until pending.length()) {
            val item = pending.optJSONObject(index)
                ?: continue

            if (
                item.optString("transaction_id") !=
                transactionId
            ) {
                remaining.put(item)
            }
        }

        prefs.edit()
            .putString(KEY_MATCHED, matched.toString())
            .putString(KEY_PENDING, remaining.toString())
            .apply()

        return true
    }

    fun matched(
        context: Context
    ): List<MatchedReceipt> {
        val array = readArray(
            prefs(context).getString(KEY_MATCHED, null)
        )

        return (0 until array.length())
            .mapNotNull { index ->
                val item = array.optJSONObject(index)
                    ?: return@mapNotNull null

                if (item.optBoolean("acknowledged", false)) {
                    return@mapNotNull null
                }

                val transactionId =
                    item.optString("transaction_id").trim()

                val networkReference =
                    item.optString("network_reference")
                        .trim()

                val matchedAt =
                    item.optLong(
                        "matched_at_millis",
                        0L
                    )

                if (
                    transactionId.isEmpty() ||
                    networkReference.isEmpty()
                ) {
                    return@mapNotNull null
                }

                MatchedReceipt(
                    transactionId = transactionId,
                    networkReference = networkReference,
                    matchedAtMillis = matchedAt
                )
            }
    }

    fun acknowledgeMatch(
        context: Context,
        transactionId: String,
        networkReference: String
    ) {
        val prefs = prefs(context)

        val array = readArray(
            prefs.getString(KEY_MATCHED, null)
        )

        val remaining = JSONArray()

        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index)
                ?: continue

            val same =
                item.optString("transaction_id") ==
                    transactionId &&
                    item.optString("network_reference") ==
                    networkReference

            if (same) {
                item.put("acknowledged", true)
            }

            // Keep acknowledged references as a bounded deduplication
            // history so a duplicate MTN SMS cannot confirm another Cash Out.
            remaining.put(item)
        }

        prefs.edit()
            .putString(KEY_MATCHED, remaining.toString())
            .apply()
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(
            PREFS_NAME,
            Context.MODE_PRIVATE
        )

    private fun readArray(raw: String?): JSONArray =
        try {
            if (raw.isNullOrBlank()) {
                JSONArray()
            } else {
                JSONArray(raw)
            }
        } catch (_: Exception) {
            JSONArray()
        }

    private fun parseAmount(
        raw: String
    ): BigDecimal? =
        try {
            BigDecimal(raw).stripTrailingZeros()
        } catch (_: NumberFormatException) {
            null
        }
}
