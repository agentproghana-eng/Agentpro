package com.agentpro.ghana

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * USSD Accessibility Automation - MTN Cash In ONLY
 *
 * WHY THIS EXISTS: MTN Cash In does not accept a pre-concatenated
 * multi-step dial string (confirmed via live testing - even a 2-step
 * "*171*3*1#" closes the session immediately). The only way to automate
 * a genuinely interactive USSD session on Android is to read and respond
 * to the system own USSD dialog via an Accessibility Service. Scoped to
 * MTN Cash In only, per an explicit decision to accept this tradeoff
 * only where single-dial genuinely does not work.
 *
 * CRITICAL SECURITY RULE: this service NEVER reads, stores, or
 * auto-enters the agent MoMo PIN. Once the screen text matches the
 * PIN-prompt signature, all automated input stops completely - the
 * agent must tap and type into the same system dialog themselves. The
 * service only keeps watching for the dialog content to change to a
 * final result, it never touches the PIN field.
 *
 * STATE MACHINE (confirmed via real device screenshots, MTN, July 2026):
 * 1. "MainMenuAgent ... 3) Cash In"      -> send "3"
 * 2. "Cash In 1) Mobile Money User ..."  -> send "1"
 * 3. "Enter mobile number"               -> send customerPhone
 * 4. "Repeat mobile number"              -> send customerPhone
 * 5. "Enter amount"                      -> send amount
 * 6. "...Enter MM PIN or 2 to cancel."   -> STOP. Report pinPromptReached.
 * 7. Final screen (success/failure text) -> report result.
 */
class UssdAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "UssdAccessibility"

        // Set by UssdAccessibilityChannel right before the dial is
        // placed. reachedPinPrompt is NOT terminal - the service keeps
        // watching for a final result after it, it just stops all input.
        @Volatile var pendingCustomerPhone: String? = null
        @Volatile var pendingAmount: String? = null
        @Volatile var isSessionActive: Boolean = false
        @Volatile var reachedPinPrompt: Boolean = false

        // Registered by UssdAccessibilityChannel so this OS-instantiated
        // service can report progress back to Flutter.
        var listener: UssdAccessibilityListener? = null

        fun startSession(customerPhone: String, amount: String) {
            pendingCustomerPhone = customerPhone
            pendingAmount = amount
            isSessionActive = true
            reachedPinPrompt = false
        }

        fun endSession() {
            isSessionActive = false
            reachedPinPrompt = false
            pendingCustomerPhone = null
            pendingAmount = null
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
            reachedPinPrompt -> handleAfterPinPrompt(screenText)
            screenText.contains("mainmenuagent") && screenText.contains("3) cash in") ->
                respond(root, "3")
            screenText.contains("cash in") && screenText.contains("1) mobile money user") ->
                respond(root, "1")
            screenText.contains("repeat mobile number") ->
                pendingCustomerPhone?.let { respond(root, it) }
            screenText.contains("enter mobile number") ->
                pendingCustomerPhone?.let { respond(root, it) }
            screenText.contains("enter amount") ->
                pendingAmount?.let { respond(root, it) }
            screenText.contains("enter mm pin") || screenText.contains("enter your pin") -> {
                reachedPinPrompt = true
                listener?.onPinPromptReached()
                Log.d(TAG, "PIN prompt reached - automation stops here")
            }
        }
    }

    // Once the PIN prompt has been seen, we never touch input again -
    // only watch for the dialog content to change to a final result.
    private fun handleAfterPinPrompt(screenText: String) {
        val successMarkers = listOf("cash in successful", "transaction successful", "received")
        val failureMarkers = listOf("failed", "insufficient", "invalid", "error", "not found")

        val isSuccess = successMarkers.any { screenText.contains(it) }
        val isFailure = failureMarkers.any { screenText.contains(it) }

        if (isSuccess || isFailure) {
            listener?.onResult(isSuccess, screenText)
            endSession()
        }
    }

    // Finds the single EditText on screen, sets its text, then finds and
    // clicks the Send button. Only ever called for menu digits, phone
    // numbers, and amounts - never for PIN entry.
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
