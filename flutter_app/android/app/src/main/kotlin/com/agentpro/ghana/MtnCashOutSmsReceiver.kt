package com.agentpro.ghana

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import java.math.BigDecimal

class MtnCashOutSmsReceiver : BroadcastReceiver() {
    companion object {
        private const val SUCCESS_PREFIX =
            "cash out made for ghs"

        private const val TRANSACTION_ID_MARKER =
            "financial transaction id:"
    }

    override fun onReceive(
        context: Context,
        intent: Intent
    ) {
        if (
            intent.action !=
            Telephony.Sms.Intents.SMS_RECEIVED_ACTION
        ) {
            return
        }

        val messages =
            Telephony.Sms.Intents
                .getMessagesFromIntent(intent)

        if (messages.isEmpty()) {
            return
        }

        val receivedAt = messages
            .map { it.timestampMillis }
            .filter { it > 0L }
            .minOrNull()
            ?: return

        val body = messages
            .joinToString(separator = "") {
                it.messageBody ?: ""
            }
            .trim()

        if (body.isEmpty()) {
            return
        }

        val normalized = body.lowercase()

        if (
            !normalized.contains(SUCCESS_PREFIX) ||
            !normalized.contains(
                TRANSACTION_ID_MARKER
            )
        ) {
            return
        }

        val receiptAmount =
            extractReceiptAmount(body)
                ?: return

        val networkReference =
            extractFinancialTransactionId(body)
                ?: return

        val receiptCustomerName =
            extractCustomerName(body)

        val candidates =
            MtnCashOutSmsStore.pending(
                context
            )
                .filter {
                    it.pinReachedAtMillis <= receivedAt &&
                        it.amount.compareTo(
                            receiptAmount
                        ) == 0
                }

        if (candidates.isEmpty()) {
            return
        }

        val exactNameMatches =
            receiptCustomerName
                ?.let { receivedName ->
                    candidates.filter { pending ->
                        val expected =
                            pending.customerName
                                ?: return@filter false

                        normalizeName(expected) ==
                            normalizeName(receivedName)
                    }
                }
                ?: emptyList()

        val selected = when {
            exactNameMatches.size == 1 ->
                exactNameMatches.single()

            candidates.size == 1 ->
                candidates.single()

            else ->
                // Same amount with no unique trusted discriminator.
                // Never guess by arrival order.
                null
        } ?: return

        MtnCashOutSmsStore.recordMatched(
            context = context,
            transactionId =
                selected.transactionId,
            networkReference =
                networkReference,
            matchedAtMillis =
                receivedAt
        )
    }

    private fun extractReceiptAmount(
        body: String
    ): BigDecimal? {
        val match = Regex(
            """(?i)cash\s+out\s+made\s+for\s+ghs\s*([0-9]+(?:\.[0-9]{1,2})?)"""
        ).find(body) ?: return null

        return try {
            BigDecimal(
                match.groupValues[1]
            ).stripTrailingZeros()
        } catch (_: NumberFormatException) {
            null
        }
    }

    private fun extractCustomerName(
        body: String
    ): String? {
        val match = Regex(
            """(?is)cash\s+out\s+made\s+for\s+ghs\s*[0-9]+(?:\.[0-9]{1,2})?\s+for\s+(.+?)(?:\.\s*current\s+balance|current\s+balance)"""
        ).find(body) ?: return null

        return match.groupValues[1]
            .trim()
            .trimEnd('.')
            .takeIf { it.isNotEmpty() }
    }

    private fun extractFinancialTransactionId(
        body: String
    ): String? {
        val match = Regex(
            """(?i)financial\s+transaction\s+id:\s*([A-Za-z0-9_-]+)"""
        ).find(body) ?: return null

        return match.groupValues[1]
            .trim()
            .takeIf { it.isNotEmpty() }
    }

    private fun normalizeName(
        value: String
    ): String =
        value
            .lowercase()
            .replace(
                Regex("[^a-z0-9]+"),
                " "
            )
            .trim()
            .replace(
                Regex("\\s+"),
                " "
            )
}
