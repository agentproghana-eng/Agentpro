package com.agentpro.ghana

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * USSD Accessibility Automation - MTN Cash In/Out, Telecel Deposit
 * (hardcoded, proven live), plus a generic data-driven interpreter for
 * any other provider/transaction_type defined via the USSD Flow Builder.
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
 * one exception is a post-PIN non-sensitive confirmation step (e.g.
 * Telecel's "Press 1 to confirm or 0 to cancel") - not sensitive (no
 * secret involved, just a yes/no on an amount already shown on screen),
 * so automation resumes just long enough to auto-press once, then
 * stops permanently.
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
 *
 * GENERIC INTERPRETER (added alongside the above, never replacing it):
 * When pendingProvider/pendingTransactionType don't match any hardcoded
 * MTN/Telecel branch above, and pendingSteps has been supplied via
 * startSession(), this falls through to a data-driven loop instead -
 * see handleGenericStep() and the ussd_flows/ussd_flow_steps backend
 * schema. This is what powers custom flows created via the USSD Flow
 * Builder (superuser: global flows; business owner: their own company's
 * flows) - it never touches or overrides the MTN/Telecel behavior above.
 */
class UssdAccessibilityService : AccessibilityService() {
    companion object {
        private const val TAG = "UssdAccessibility"

        // Set by UssdAccessibilityChannel right before the dial is
        // placed. reachedPinPrompt is NOT terminal - the service keeps
        // watching for a final result after it, it just stops all
        // sensitive input. confirmSent guards the one-time post-PIN
        // auto-confirm (MTN/Telecel hardcoded, or generic) so it's
        // never sent more than once.
        @Volatile var pendingCustomerPhone: String? = null
        @Volatile var pendingAmount: String? = null
        @Volatile var pendingTransactionType: String? = null
        @Volatile var pendingProvider: String? = null
        @Volatile var pendingOperatorId: String? = null
        @Volatile var isSessionActive: Boolean = false
        @Volatile var reachedPinPrompt: Boolean = false
        @Volatile var confirmSent: Boolean = false

        // Generic-flow-only state. Null for every MTN/Telecel session -
        // those never set these, so their behavior is 100% unchanged
        // from before this interpreter existed.
        @Volatile var pendingSteps: List<FlowStep>? = null
        @Volatile var pendingSuccessMarkers: List<String>? = null
        @Volatile var pendingFailureMarkers: List<String>? = null

        // Registered by UssdAccessibilityChannel so this OS-instantiated
        // service can report progress back to Flutter.
        var listener: UssdAccessibilityListener? = null

        fun startSession(
            customerPhone: String,
            amount: String,
            transactionType: String,
            provider: String,
            operatorId: String? = null,
            steps: List<FlowStep>? = null,
            successMarkers: List<String>? = null,
            failureMarkers: List<String>? = null
        ) {
            pendingCustomerPhone = customerPhone
            pendingAmount = amount
            pendingTransactionType = transactionType
            pendingProvider = provider
            pendingOperatorId = operatorId
            pendingSteps = steps
            pendingSuccessMarkers = successMarkers
            pendingFailureMarkers = failureMarkers
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
            pendingSteps = null
            pendingSuccessMarkers = null
            pendingFailureMarkers = null
        }
    }

    // One step of a generic, data-driven flow (mirrors ussd_flow_steps
    // rows). matchAll: ALL substrings must be present in the current
    // screen text for this step to fire - same AND semantics already
    // used by the hardcoded MTN/Telecel branches above.
    data class FlowStep(
        val matchAll: List<String>,
        val action: String,
        val actionValue: String?
    )

    interface UssdAccessibilityListener {
        fun onPinPromptReached()
        fun onResult(outcome: String, message: String)
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

            // ── Telecel Deposit (unchanged from the pilot) ──
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

            // ── Generic interpreter (new provider/type combos only -
            // never reached for MTN/Telecel, since their branches above
            // always match first) ──
            pendingSteps != null -> handleGenericStep(root, screenText)
        }
    }

    // Once the PIN prompt has been seen, we never touch the PIN itself
    // again. MTN/Telecel's hardcoded post-PIN handling is completely
    // unchanged; the generic-flow checks below only ever activate when
    // pendingSteps was actually supplied (i.e. never for MTN/Telecel).
    private fun handleAfterPinPrompt(root: AccessibilityNodeInfo, screenText: String) {
        if (pendingProvider == "telecel" && !confirmSent && screenText.contains("press 1 to confirm")) {
            confirmSent = true
            respond(root, "1")
            Log.d(TAG, "Telecel: auto-confirmed transaction (non-sensitive step)")
            return
        }

        val steps = pendingSteps
        if (steps != null && !confirmSent) {
            val confirmStep = steps.find { it.action == "auto_confirm_once" && it.matchAll.all { m -> screenText.contains(m) } }
            if (confirmStep != null) {
                confirmSent = true
                confirmStep.actionValue?.let { respond(root, it) }
                Log.d(TAG, "Generic flow: auto-confirmed transaction (non-sensitive step)")
                return
            }
        }

        // MTN/Telecel keep their exact original hardcoded marker lists
        // (pendingSuccessMarkers/pendingFailureMarkers are null for
        // them). Generic flows use the markers configured on their own
        // ussd_flows row.
        //
        // "Connection problem or invalid MMI code" is Android's own
        // generic USSD wrapper text - confirmed via live device testing
        // to appear identically in TWO different real situations that
        // must be told apart:
        //   - preceded by "MMI complete." -> the USSD session actually
        //     finished end-to-end (Android's own MMI transaction
        //     completed), even though the trailing text is misleadingly
        //     worded - this is a genuine SUCCESS.
        //   - with no "MMI complete." anywhere on screen -> the session
        //     was aborted before ever completing - a genuine FAILURE.
        // What actually distinguishes the two is the presence of "MMI
        // complete.", not the "connection problem" text itself, which
        // is identical either way.
        val successMarkers = pendingSuccessMarkers ?: listOf("receive cash in", "cash in successful", "transaction successful", "successful", "received")
        val failureMarkers = pendingFailureMarkers ?: listOf("failed", "insufficient", "not found", "error")
        val hasConnectionProblemText = screenText.contains("connection problem") || screenText.contains("invalid mmi code")
        val hasMmiComplete = screenText.contains("mmi complete")

        val isSuccess = successMarkers.any { screenText.contains(it) } || (hasConnectionProblemText && hasMmiComplete)
        val isFailure = failureMarkers.any { screenText.contains(it) } || (hasConnectionProblemText && !hasMmiComplete)

        if (isSuccess || isFailure) {
            listener?.onResult(if (isSuccess) "success" else "failure", screenText)
            endSession()
        }
    }

    // Data-driven step matching for any provider/transaction_type not
    // covered by the hardcoded MTN/Telecel branches above. First
    // matching step wins (steps are already ordered by step_order),
    // mirroring the same top-to-bottom priority the hardcoded `when`
    // block above already uses.
    private fun handleGenericStep(root: AccessibilityNodeInfo, screenText: String) {
        val steps = pendingSteps ?: return
        for (step in steps) {
            if (step.matchAll.isNotEmpty() && step.matchAll.all { screenText.contains(it) }) {
                when (step.action) {
                    "send_digit", "send_literal" -> step.actionValue?.let { respond(root, it) }
                    "send_customer_phone" -> pendingCustomerPhone?.let { respond(root, it) }
                    "send_amount" -> pendingAmount?.let { respond(root, it) }
                    "send_operator_id" -> pendingOperatorId?.let { respond(root, it) }
                    "pin_prompt" -> {
                        reachedPinPrompt = true
                        listener?.onPinPromptReached()
                        Log.d(TAG, "Generic flow: PIN prompt reached")
                    }
                    // auto_confirm_once is only ever actioned from
                    // handleAfterPinPrompt(), never here.
                }
                return
            }
        }
    }

    // Finds the single EditText on screen, sets its text, then finds and
    // clicks the Send button. Only ever called for menu digits, phone
    // numbers, amounts, Operator ID, and non-sensitive post-PIN confirm
    // digits - never for PIN entry itself.
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
