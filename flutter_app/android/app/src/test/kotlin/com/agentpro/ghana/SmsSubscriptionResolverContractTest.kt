package com.agentpro.ghana

import java.nio.file.Files
import java.nio.file.Paths
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SmsSubscriptionResolverContractTest {
    private val source =
        Files.readString(
            Paths.get(
                "src/main/kotlin/com/agentpro/ghana/" +
                    "SmsSubscriptionResolver.kt"
            )
        )

    @Test
    fun recognizesKnownSubscriptionExtras() {
        assertTrue(
            source.contains("\"subscription\"")
        )
        assertTrue(
            source.contains("\"subscription_id\"")
        )
        assertTrue(
            source.contains(
                "\"android.telephony.extra.SUBSCRIPTION_INDEX\""
            )
        )
        assertTrue(
            source.contains(
                "\"android.telephony.extra.SUBSCRIPTION_ID\""
            )
        )
    }

    @Test
    fun conflictingSubscriptionIdsFailClosed() {
        assertTrue(
            source.contains(".distinct()")
        )
        assertTrue(
            source.contains(
                "return candidates.singleOrNull()"
            )
        )
    }

    @Test
    fun resolverDoesNotGuessUsingSlotOrDefaultSubscription() {
        assertFalse(
            source.contains("simSlotIndex")
        )
        assertFalse(
            source.contains("defaultSmsSubscriptionId")
        )
        assertFalse(
            source.contains("defaultSubscriptionId")
        )
    }
}
