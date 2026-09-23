package com.agentpro.ghana

import java.io.File
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TelecelMerchantBalanceSmsStoreContractTest {
    private val source =
        File(
            "src/main/kotlin/com/agentpro/ghana/" +
                "TelecelMerchantBalanceSmsStore.kt"
        ).readText()

    @Test
    fun `uses persistent observation array rather than single slot`() {
        assertTrue(
            source.contains(
                """private const val PENDING =
        "pending_observations""""
            )
        )

        assertTrue(source.contains("JSONArray(raw)"))
        assertTrue(source.contains("array.put(encode(observation))"))
    }

    @Test
    fun `deduplicates exact source reference`() {
        assertTrue(
            source.contains(
                "it.sourceReference ==",
            )
        )
        assertTrue(
            source.contains(
                "observation.sourceReference",
            )
        )
        assertTrue(source.contains("return false"))
    }

    @Test
    fun `returns observations oldest first`() {
        assertTrue(
            source.contains(
                "compareBy<PendingObservation>",
            )
        )
        assertTrue(
            source.contains(
                "it.receivedAtMillis",
            )
        )
        assertTrue(
            source.contains(
                ".thenBy",
            )
        )
    }

    @Test
    fun `acknowledges only exact source reference`() {
        assertTrue(
            source.contains(
                "fun acknowledge(",
            )
        )
        assertTrue(
            source.contains(
                "observations.filterNot",
            )
        )
        assertTrue(
            source.contains(
                "normalizedReference",
            )
        )
    }

    @Test
    fun `does not silently evict unacknowledged observations`() {
        assertFalse(source.contains("removeAt(0)"))
        assertFalse(source.contains("takeLast("))
        assertFalse(source.contains("MAX_PENDING"))
        assertFalse(source.contains("clear()"))
    }

    @Test
    fun `does not persist sensitive raw SMS or credentials`() {
        assertFalse(source.contains("\"sms_body\""))
        assertFalse(source.contains("\"sender\""))
        assertFalse(source.contains("\"pin\""))
        assertFalse(source.contains("\"operator_id\""))
        assertFalse(
            source.contains(
                "\"organisation_shortcode\"",
            )
        )
    }

    @Test
    fun `uses synchronous persistence before receiver returns`() {
        assertTrue(source.contains(".commit()"))
        assertFalse(source.contains(".apply()"))
    }
}
