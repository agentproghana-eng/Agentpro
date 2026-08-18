package com.agentpro.ghana

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.TelephonyManager
import android.telephony.SubscriptionManager
import android.util.Log
import androidx.annotation.RequiresApi
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * USSD Automation Engine - Android Native Bridge
 *
 * Dials a single, fully-resolved USSD string per transaction and waits
 * for the network's response(s) via TelephonyManager.sendUssdRequest().
 *
 * ── WHY NO "SEND FOLLOW-UP INPUT" METHOD EXISTS HERE ──
 * Android's public USSD API is single request -> single response. There
 * is no method for a third-party app to reply to an already-open
 * interactive USSD session — this was confirmed against multiple
 * independent sources during a redesign of this file (see
 * backend/migrations/002_ussd_single_dial_redesign.sql for the full
 * explanation). An earlier version of this file had a sendUSSDInput()
 * method that looked plausible but never actually did anything — it
 * had no real API to call. Do not re-add it without first confirming
 * a genuine Android API exists for it.
 *
 * ── HOW waitForResponse SUPPORTS BEING CALLED TWICE ──
 * The Dart engine may call waitForResponse() a second time on the same
 * session if the first response looked like a PIN prompt, to see
 * whether a further response ever arrives after PIN entry. Each call
 * consumes and clears lastResponse rather than destroying the session,
 * so a second wait can pick up a later callback invocation. Sessions
 * are only removed via cancelUSSD() or opportunistic pruning of stale
 * entries in dialUSSD() — see pruneStaleSessions().
 *
 * CRITICAL SECURITY:
 * - This bridge NEVER captures, stores, or logs MoMo PINs
 * - The dialed string never contains a PIN — see ussd_service.dart
 * - PIN entry happens entirely at the OS/network level, outside any
 *   code in this file
 */
class USSDMethodChannel(
    private val context: Context,
    private val messenger: BinaryMessenger
) : MethodChannel.MethodCallHandler {

    companion object {
        private const val TAG = "USSDEngine"
        private const val MAX_SESSION_AGE_MS = 5 * 60 * 1000L // 5 minutes
    }

    private lateinit var channel: MethodChannel
    private val sessions = ConcurrentHashMap<String, USSDSession>()
    private val mainHandler = Handler(Looper.getMainLooper())

    data class USSDSession(
        val sessionId: String,
        val createdAtMs: Long = System.currentTimeMillis(),
        var lastResponse: String? = null,
        val lock: ReentrantLock = ReentrantLock(),
        val condition: java.util.concurrent.locks.Condition = lock.newCondition()
    )

    fun register(channelName: String) {
        channel = MethodChannel(messenger, channelName)
        channel.setMethodCallHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "dialUSSD" -> dialUSSD(call, result)
            "waitForResponse" -> waitForResponse(call, result)
            "cancelUSSD" -> cancelUSSD(call, result)
            else -> result.notImplemented()
        }
    }

    /**
     * Dial a fully-resolved USSD string (e.g. "*170*1*2*0241234567*250#")
     * on the specified SIM slot, as a single request. Returns a session
     * ID used to retrieve the network's response(s) via waitForResponse.
     */
    @RequiresApi(Build.VERSION_CODES.O)
    private fun dialUSSD(call: MethodCall, result: MethodChannel.Result) {
        val ussdCode = call.argument<String>("ussd_code")
        val simSlot = call.argument<Int>("sim_slot")

        if (ussdCode.isNullOrBlank()) {
            result.error("INVALID_ARGS", "USSD code is required", null)
            return
        }

        if (simSlot == null || simSlot < 0) {
            result.error(
                "SIM_REQUIRED",
                "A valid physical SIM slot is required for USSD dialing",
                null
            )
            return
        }

        pruneStaleSessions()

        Log.d(TAG, "Dialing USSD on SIM slot $simSlot")

        val sessionId = java.util.UUID.randomUUID().toString()
        val session = USSDSession(sessionId)
        sessions[sessionId] = session

        try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager

            val subscriptionInfo =
                subscriptionManager.getActiveSubscriptionInfoForSimSlotIndex(
                    simSlot
                )

            if (subscriptionInfo == null) {
                sessions.remove(sessionId)
                result.error(
                    "SIM_UNAVAILABLE",
                    "The selected SIM is not active or cannot be resolved",
                    null
                )
                return
            }

            val subscriptionId = subscriptionInfo.subscriptionId

            if (subscriptionId < 0) {
                sessions.remove(sessionId)
                result.error(
                    "SIM_UNAVAILABLE",
                    "The selected SIM has no valid subscription",
                    null
                )
                return
            }

            val tmForSub =
                telephonyManager.createForSubscriptionId(subscriptionId)

            // This same callback instance handles every response for this
            // session — including a possible second invocation after a
            // PIN prompt resolves, if the OS/network deliver one.
            tmForSub.sendUssdRequest(
                ussdCode,
                object : TelephonyManager.UssdResponseCallback() {
                    override fun onReceiveUssdResponse(
                        telephonyManager: TelephonyManager,
                        request: String,
                        response: CharSequence
                    ) {
                        val responseStr = response.toString()
                        Log.d(TAG, "USSD response received (length: ${responseStr.length})")
                        session.lock.withLock {
                            session.lastResponse = responseStr
                            session.condition.signalAll()
                        }
                    }

                    override fun onReceiveUssdResponseFailed(
                        telephonyManager: TelephonyManager,
                        request: String,
                        failureCode: Int
                    ) {
                        Log.e(TAG, "USSD failed with code: $failureCode")
                        session.lock.withLock {
                            session.lastResponse = "ERROR:$failureCode"
                            session.condition.signalAll()
                        }
                    }
                },
                mainHandler
            )

            result.success(sessionId)

        } catch (e: SecurityException) {
            Log.e(TAG, "Permission denied for USSD: ${e.message}")
            sessions.remove(sessionId)
            result.error("PERMISSION_DENIED",
                "CALL_PHONE permission is required for USSD automation", null)
        } catch (e: Exception) {
            Log.e(TAG, "USSD dial error: ${e.message}")
            sessions.remove(sessionId)
            result.error("USSD_ERROR", e.message, null)
        }
    }

    /**
     * Wait for the next response on a session. Consumes and clears
     * lastResponse rather than removing the session, so this can be
     * called again on the same session to wait for a possible further
     * response (e.g. after a PIN prompt). The session itself is only
     * removed by cancelUSSD() or pruneStaleSessions().
     */
    private fun waitForResponse(call: MethodCall, result: MethodChannel.Result) {
        val sessionId = call.argument<String>("session_id")
        val timeoutSeconds = call.argument<Int>("timeout_seconds") ?: 30

        val session = sessionId?.let { sessions[it] }
        if (session == null) {
            result.error("INVALID_SESSION", "Session not found: $sessionId", null)
            return
        }

        Thread {
            session.lock.withLock {
                if (session.lastResponse == null) {
                    session.condition.await(timeoutSeconds.toLong(), TimeUnit.SECONDS)
                }
            }

            val response = session.lastResponse ?: "TIMEOUT"
            // Clear (don't remove the session) so a subsequent wait on
            // the same session starts fresh rather than immediately
            // re-returning this same response.
            session.lock.withLock { session.lastResponse = null }

            mainHandler.post {
                result.success(response)
            }
        }.start()
    }

    private fun cancelUSSD(call: MethodCall, result: MethodChannel.Result) {
        val sessionId = call.argument<String>("session_id")
        if (sessionId != null) {
            val session = sessions[sessionId]
            session?.lock?.withLock {
                session.lastResponse = "CANCELLED"
                session.condition.signalAll()
            }
            sessions.remove(sessionId)
        }
        result.success(true)
    }

    /** Removes sessions that have outlived any plausible wait — guards
     * against unbounded growth if a Dart-side caller ever fails to call
     * cancelUSSD (e.g. app killed mid-transaction). */
    private fun pruneStaleSessions() {
        val now = System.currentTimeMillis()
        sessions.entries.removeAll { (_, session) -> now - session.createdAtMs > MAX_SESSION_AGE_MS }
    }
}
