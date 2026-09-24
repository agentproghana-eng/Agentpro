package com.agentpro.ghana

import java.math.BigDecimal

data class TelecelMerchantBalanceObservation(
    val merchantAccountBalance: BigDecimal,
    val workingAccountBalance: BigDecimal,
)

object TelecelMerchantBalanceSmsParser {
    /*
     * Verified T-CASH wording:
     *
     * M-Pesa Account For Organization Balance is GHS...
     * Merchant Account Balance is GHS...
     *
     * The parser intentionally requires BOTH balances.
     * A partial or ambiguous message must never initialize financial state.
     */
    private val workingAccountPattern = Regex(
        """(?i)\bm-pesa\s+account\s+for\s+organization\s+balance\s+is\s+ghs\s*([0-9]+(?:\.[0-9]{1,2})?)\b"""
    )

    private val merchantAccountPattern = Regex(
        """(?i)\bmerchant\s+account\s+balance\s+is\s+ghs\s*([0-9]+(?:\.[0-9]{1,2})?)\b"""
    )

    fun parse(body: String): TelecelMerchantBalanceObservation? {
        val normalized = body.trim()

        if (normalized.isEmpty()) {
            return null
        }

        val workingMatches =
            workingAccountPattern.findAll(normalized).toList()

        val merchantMatches =
            merchantAccountPattern.findAll(normalized).toList()

        // Fail closed on missing or duplicate financial fields.
        if (
            workingMatches.size != 1 ||
            merchantMatches.size != 1
        ) {
            return null
        }

        val working = parseMoney(
            workingMatches.single().groupValues[1]
        ) ?: return null

        val merchant = parseMoney(
            merchantMatches.single().groupValues[1]
        ) ?: return null

        return TelecelMerchantBalanceObservation(
            merchantAccountBalance = merchant,
            workingAccountBalance = working,
        )
    }

    private fun parseMoney(value: String): BigDecimal? =
        try {
            BigDecimal(value).setScale(2)
        } catch (_: NumberFormatException) {
            null
        }
}
