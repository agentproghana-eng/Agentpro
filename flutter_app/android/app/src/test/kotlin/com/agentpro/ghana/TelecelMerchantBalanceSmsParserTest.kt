package com.agentpro.ghana

import java.math.BigDecimal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotNull
import org.junit.Test

class TelecelMerchantBalanceSmsParserTest {

    @Test
    fun parsesVerifiedTCashBalanceMessage() {
        val result =
            TelecelMerchantBalanceSmsParser.parse(
                """
                M-Pesa Account For Organization Balance is GHS2.79
                Merchant Account Balance is GHS1.00
                """.trimIndent()
            )

        assertNotNull(result)
        assertEquals(
            BigDecimal("2.79"),
            result!!.workingAccountBalance,
        )
        assertEquals(
            BigDecimal("1.00"),
            result.merchantAccountBalance,
        )
    }

    @Test
    fun acceptsWhitespaceAndCaseVariation() {
        val result =
            TelecelMerchantBalanceSmsParser.parse(
                """
                m-pesa   account for organization
                balance is ghs 20.50
                MERCHANT ACCOUNT BALANCE IS GHS10.25
                """.trimIndent()
            )

        assertNotNull(result)
        assertEquals(
            BigDecimal("20.50"),
            result!!.workingAccountBalance,
        )
        assertEquals(
            BigDecimal("10.25"),
            result.merchantAccountBalance,
        )
    }

    @Test
    fun rejectsMissingWorkingBalance() {
        assertNull(
            TelecelMerchantBalanceSmsParser.parse(
                "Merchant Account Balance is GHS1.00"
            )
        )
    }

    @Test
    fun rejectsMissingMerchantBalance() {
        assertNull(
            TelecelMerchantBalanceSmsParser.parse(
                "M-Pesa Account For Organization Balance is GHS2.79"
            )
        )
    }

    @Test
    fun rejectsDuplicateWorkingBalance() {
        assertNull(
            TelecelMerchantBalanceSmsParser.parse(
                """
                M-Pesa Account For Organization Balance is GHS2.79
                M-Pesa Account For Organization Balance is GHS999.00
                Merchant Account Balance is GHS1.00
                """.trimIndent()
            )
        )
    }

    @Test
    fun rejectsDuplicateMerchantBalance() {
        assertNull(
            TelecelMerchantBalanceSmsParser.parse(
                """
                M-Pesa Account For Organization Balance is GHS2.79
                Merchant Account Balance is GHS1.00
                Merchant Account Balance is GHS999.00
                """.trimIndent()
            )
        )
    }

    @Test
    fun rejectsMalformedMoney() {
        assertNull(
            TelecelMerchantBalanceSmsParser.parse(
                """
                M-Pesa Account For Organization Balance is GHS2.999
                Merchant Account Balance is GHS1.00
                """.trimIndent()
            )
        )
    }

    @Test
    fun rejectsNegativeMoney() {
        assertNull(
            TelecelMerchantBalanceSmsParser.parse(
                """
                M-Pesa Account For Organization Balance is GHS-2.79
                Merchant Account Balance is GHS1.00
                """.trimIndent()
            )
        )
    }

    @Test
    fun rejectsEmptyMessage() {
        assertNull(
            TelecelMerchantBalanceSmsParser.parse("")
        )
    }
}
