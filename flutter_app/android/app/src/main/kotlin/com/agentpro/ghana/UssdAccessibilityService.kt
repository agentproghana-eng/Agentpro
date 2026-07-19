package com.agentpro.ghana

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * USSD Accessibility Automation - MTN Cash In/Out, Telecel Deposit
 *
 * WHY THIS EXISTS: neither MTN Cash In nor Telecel Deposit accept a
 * pre-concatenated multi-step dial string (confirmed via live testing -
 * even a short concatenated dial closes the session immediately). The
 * only way to automate a genuinely interactive USSD session on Android
 * is to read and respond to the system's own USSD dialog via an
 * Accessibility Service.
 *
 * CRITICAL SECURITY RULE: this service NEVER reads, stores, or
 * auto-enters the agent's MoMo PIN. Once the screen text matches the
 * PIN-prompt signature, all automated input stops completely - the
 * agent must tap and type into the same system dialog themselves. The
 * one exception is Telecel's post-PIN confirmation step ("Press 1 to
 * confirm or 0 to cancel") - this is NOT sensitive (no secret involved,
 * just a yes/no on an amount already shown on screen), so automation
 * resumes just long enough to auto-press "1", then stops permanently.
 *
 * STATE MACHINE - MTN (confirmed via real device screenshots, July 2026):
 * 1. "MainMenuAgent ... 3) Cash In"      -> send "3" (Cash In) or "2" (Cash Out)
 * 2. "Cash In 1) Mobile Money User ..."  -> send "1"
 * 3. "Enter mobile number"               -> send customerPhone
 * 4. "Repeat mobile number"              -> send customerPhone
 * 5. "Enter amount"                      -> send amount
 * 6. "...Enter MM PIN or 2 to cancel."   -> STOP. Report pinPromptReached.
 * 7. Final screen (success/failure text) -> report result.
 *
 * STATE MACHINE - Telecel Deposit (confirmed via real device screenshots,
 * July 2026, dialing *110#):
 * 1. "1 Deposit 2 Agent Transactions..." -> send "1"
 * 2. "Enter phone no"                    -> send customerPhone
 * 3. "Enter amount"                      -> send amount
 * 4. "Enter Operator ID"                 -> send operatorId (agent-specific, saved in Settings)
 * 5. "Enter PIN:"                        -> STOP. Report pinPromptReached.
 * 6. "...Press 1 to confirm or 0 to cancel:" -> auto-send "1" (NOT sensitive - see above)
 * 7. Final screen (success/failure text) -> report result.
 */
class UssdAccessibilityService : AccessibilityService() {
    companion object {
        private const val TAG = "UssdAccessibility"

        // Set by UssdAccessibilityChannel right before the dial is
        // placed. reachedPinPrompt is NOT terminal - the service keeps
        // watching for a final result after it, it just stops all
        // sensitive input. confirmSent guards Telecel's one-time
        // post-PIN auto-confirm so it's never sent more than once.
        @Volatile var pendingCustomerPhone: String? = null
        @Volatile var pendingAmount: String? = null
        @Volatile var pendingTransactionType: String? = null
        @Volatile var pendingProvider: String? = null
        @Volatile var pendingOperatorId: String? = null
        @Volatile var isSessionActive: Boolean = false
        @Volatile var reachedPinPrompt: Boolean = false
        @Volatile var confirmSent: Boolean = false

        // Registered by UssdAccessibilityChannel so this OS-instantiated
        // service can report progress back to Flutter.
        var listener: UssdAccessibilityListener? = null

        fun startSession(
            customerPhone: String,
            amount: String,
            transactionType: String,
            provider: String,
            operatorId: String? = null
        ) {
            pendingCustomerPhone = customerPhone
            pendingAmount = amount
            pendingTransactionType = transactionType
            pendingProvider = provider
            pendingOperatorId = operatorId
            isSessionActive = true
            reachedPinPrompt = false
            confirmSent = false
        }

        fun endSession() {
            isSessionActive = false
            reachedPinPrompt = false
            confirmSent = false
            pendingCustomerPhone = null
            pendingAmount = null
            pendingTransactionType = null
            pendingProvider = null
            pendingOperatorId = null
        }
    }

    interface UssdAccessibilityListener {
        fun onPinPromptReached()
        fun onResult(success: Boolean, message: String)
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.d(TAG, "UssdAccessibilityService connected")
    }

    override fun onInterrupt() {
        Log.w(TAG, "UssdAccessibilityService interrupted")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (!isSessionActive) return
        val root = rootInActiveWindow ?: return
        val screenText = collectText(root).lowercase()

        when {
            reachedPinPrompt -> handleAfterPinPrompt(root, screenText)

            // ── MTN (unchanged from the original pilot) ──
            pendingProvider == "mtn" && pendingTransactionType == "cash_in" && screenText.contains("mainmenuagent") && screenText.contains("3) cash in") ->
                respond(root, "3")
            pendingProvider == "mtn" && pendingTransactionType == "cash_out" && screenText.contains("mainmenuagent") && screenText.contains("2) cash out") ->
                respond(root, "2")
            pendingProvider == "mtn" && pendingTransactionType == "cash_in" && screenText.contains("cash in") && screenText.contains("1) mobile money user") ->
                respond(root, "1")
            pendingProvider == "mtn" && pendingTransactionType == "cash_out" && screenText.contains("cash out") && screenText.contains("1) mobile money user") ->
                respond(root, "1")
            pendingProvider == "mtn" && screenText.contains("repeat mobile number") ->
                pendingCustomerPhone?.let { respond(root, it) }
            pendingProvider == "mtn" && screenText.contains("enter mobile number") ->
                pendingCustomerPhone?.let { respond(root, it) }
            pendingProvider == "mtn" && screenText.contains("amount") ->
                pendingAmount?.let { respond(root, it) }
            pendingProvider == "mtn" && (screenText.contains("enter mm pin") || screenText.contains("enter your pin")) -> {
                reachedPinPrompt = true
                listener?.onPinPromptReached()
                Log.d(TAG, "MTN PIN prompt reached - automation stops here")
            }

            // ── Telecel Deposit ──
            pendingProvider == "telecel" && screenText.contains("1 deposit") && screenText.contains("2 agent transactions") ->
                respond(root, "1")
            pendingProvider == "telecel" && screenText.contains("enter phone no") ->
                pendingCustomerPhone?.let { respond(root, it) }
            pendingProvider == "telecel" && screenText.contains("enter amount") ->
                pendingAmount?.let { respond(root, it) }
            pendingProvider == "telecel" && screenText.contains("enter operator id") ->
                pendingOperatorId?.let { respond(root, it) }
            pendingProvider == "telecel" && screenText.contains("enter pin") -> {
                reachedPinPrompt = true
                listener?.onPinPromptReached()
                Log.d(TAG, "Telecel PIN prompt reached - automation stops sensitive input, will auto-confirm after")
            }
        }
    }

    // Once the PIN prompt has been seen, we never touch the PIN itself
    // again. For Telecel specifically, one more non-sensitive step
    // follows PIN entry - a confirmation screen ("Press 1 to confirm or
    // 0 to cancel") showing the same amount/phone already visible on
    // screen, no secret involved. confirmSent guards this being sent
    // more than once. After that (or immediately for MTN, which has no
    // such step), we only ever watch for a final result.
    private fun handleAfterPinPrompt(root: AccessibilityNodeInfo, screenText: String) {
        if (pendingProvider == "telecel" && !confirmSent && screenText.contains("press 1 to confirm")) {
            confirmSent = true
            respond(root, "1")
            Log.d(TAG, "Telecel: auto-confirmed transaction (non-sensitive step)")
            return
        }

        val successMarkers = listOf("cash in successful", "transaction successful", "successful", "received")
        val failureMarkers = listOf("failed", "insufficient", "invalid", "error", "not found", "connection problem")
        val isSuccess = successMarkers.any { screenText.contains(it) }
        val isFailure = failureMarkers.any { screenText.contains(it) }

        if (isSuccess || isFailure) {
            listener?.onResult(isSuccess, screenText)
            endSession()
        }
    }

    // Finds the single EditText on screen, sets its text, then finds and
    // clicks the Send button. Only ever called for menu digits, phone
    // numbers, amounts, Operator ID, and Telecel's post-PIN confirm
    // digit - never for PIN entry itself.
    private fun respond(root: AccessibilityNodeInfo, value: String) {
        val editText = findByClassName(root, "android.widget.EditText") ?: run {
            Log.w(TAG, "No EditText found on screen")
            return
        }
        val args = Bundle()
        args.putCharSequence(
            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value
        )
        editText.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        val sendButton = findByText(root, "send")
        if (sendButton != null) {
            sendButton.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        } else {
            Log.w(TAG, "No Send button found on screen")
        }
    }

    // recycle() deliberately omitted below - node pooling was removed
    // in modern Android, calling recycle() ourselves risks using an
    // already-recycled node on older versions since this class walks
    // the tree more than once (once for text, again for input nodes).
    private fun findByClassName(node: AccessibilityNodeInfo, className: String): AccessibilityNodeInfo? {
        if (node.className?.toString() == className) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findByClassName(child, className)
            if (found != null) return found
        }
        return null
    }

    private fun findByText(node: AccessibilityNodeInfo, text: String): AccessibilityNodeInfo? {
        val nodeText = node.text?.toString()?.lowercase()
        if (nodeText == text.lowercase()) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findByText(child, text)
            if (found != null) return found
        }
        return null
    }

    private fun collectText(node: AccessibilityNodeInfo): String {
        val builder = StringBuilder()
        node.text?.let { builder.append(it).append(" ") }
        node.contentDescription?.let { builder.append(it).append(" ") }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            builder.append(collectText(child))
        }
        return builder.toString()
    }
}
