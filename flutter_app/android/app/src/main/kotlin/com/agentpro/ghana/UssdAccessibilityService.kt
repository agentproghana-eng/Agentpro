package com.agentpro.ghana

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.security.MessageDigest

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

        // A single unmatched Accessibility event is not enough evidence
        // that the provider menu changed. Android commonly publishes
        // duplicate/stale roots while the USSD dialog is transitioning.
        private const val MAX_GENERIC_FLOW_MISMATCHES = 3
        private const val REPEATED_MISMATCH_MIN_INTERVAL_MS = 2000L
        private const val RECENT_MATCH_SCREEN_GRACE_MS = 8000L

        // Set by UssdAccessibilityChannel right before the dial is
        // placed. reachedPinPrompt is a strict WRITE boundary: after it
        // becomes true, the service may continue observing provider screens
        // for a final success/failure result, but it must never submit any
        // further text, menu choice, button click, or confirmation.
        @Volatile var pendingCustomerPhone: String? = null
        @Volatile var pendingAmount: String? = null
        @Volatile var pendingTransactionType: String? = null
        @Volatile var pendingProvider: String? = null
        @Volatile var pendingBusinessSimRole: String? = null
        @Volatile var pendingOperatorId: String? = null
        @Volatile var pendingReference: String? = null
        @Volatile var pendingMerchantId: String? = null
        @Volatile var currentStepIndex: Int = 0
        @Volatile var isSessionActive: Boolean = false
        @Volatile var reachedPinPrompt: Boolean = false

        // Duplicate-event suppression is session state too. lastScreenText
        // may contain raw provider text, while lastResponseValue may contain
        // a phone number, amount, operator ID, reference, or menu selection.
        // Keep them alongside the other session fields so start/end can
        // explicitly wipe them rather than leaving them in service memory.
        @Volatile private var lastScreenText: String? = null
        @Volatile private var lastScreenHandledAt: Long = 0L
        @Volatile private var lastResponseValue: String? = null
        @Volatile private var lastResponseAt: Long = 0L
        @Volatile private var lastResponseStepIndex: Int = -1

        // Generic pre-PIN flow-mismatch evidence. Raw screen text is never
        // written to mismatch telemetry; only a SHA-256 digest is retained.
        @Volatile private var genericFlowMismatchCount: Int = 0
        @Volatile private var lastMismatchScreenHash: String? = null
        @Volatile private var lastMismatchAt: Long = 0L
        @Volatile private var lastMatchedScreenHash: String? = null
        @Volatile private var lastMatchedScreenAt: Long = 0L

        // Generic-flow-only state. Null for every MTN/Telecel session -
        // those never set these, so their behavior is 100% unchanged
        // from before this interpreter existed.
        @Volatile var pendingSteps: List<FlowStep>? = null
        @Volatile var pendingSuccessMarkers: List<String>? = null
        @Volatile var pendingFailureMarkers: List<String>? = null
        @Volatile var pendingSelections: Map<String, String>? = null

        // Registered by UssdAccessibilityChannel so this OS-instantiated
        // service can report progress back to Flutter.
        var listener: UssdAccessibilityListener? = null

        fun startSession(
            customerPhone: String?,
            amount: String?,
            transactionType: String,
            provider: String,
            businessSimRole: String? = null,
            operatorId: String? = null,
            reference: String? = null,
            merchantId: String? = null,
            steps: List<FlowStep>? = null,
            selections: Map<String, String>? = null,
            successMarkers: List<String>? = null,
            failureMarkers: List<String>? = null
        ) {
            pendingCustomerPhone = customerPhone
            pendingAmount = amount
            pendingTransactionType = transactionType
            pendingProvider = provider
            pendingBusinessSimRole = businessSimRole
            pendingOperatorId = operatorId
            pendingReference = reference
            pendingMerchantId = merchantId
            pendingSteps = steps
            pendingSelections = selections
            currentStepIndex = 0
            pendingSuccessMarkers = successMarkers
            pendingFailureMarkers = failureMarkers
            // Never let duplicate-detection state bleed from a previous
            // transaction into the new one.
            lastScreenText = null
            lastScreenHandledAt = 0L
            lastResponseValue = null
            lastResponseAt = 0L
            lastResponseStepIndex = -1
            genericFlowMismatchCount = 0
            lastMismatchScreenHash = null
            lastMismatchAt = 0L
            lastMatchedScreenHash = null
            lastMatchedScreenAt = 0L

            isSessionActive = true
            reachedPinPrompt = false
        }

        fun endSession() {
            isSessionActive = false
            reachedPinPrompt = false
            pendingCustomerPhone = null
            pendingAmount = null
            pendingTransactionType = null
            pendingProvider = null
            pendingBusinessSimRole = null
            pendingOperatorId = null
            pendingReference = null
            pendingMerchantId = null
            pendingSelections = null
            pendingSteps = null
            currentStepIndex = 0
            pendingSuccessMarkers = null
            pendingFailureMarkers = null

            // Raw USSD screen text and the last value written into the USSD
            // input field must not survive the transaction lifecycle.
            lastScreenText = null
            lastScreenHandledAt = 0L
            lastResponseValue = null
            lastResponseAt = 0L
            lastResponseStepIndex = -1
            genericFlowMismatchCount = 0
            lastMismatchScreenHash = null
            lastMismatchAt = 0L
            lastMatchedScreenHash = null
            lastMatchedScreenAt = 0L
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
        Log.i(TAG, "UssdAccessibilityService connected")
    }

    override fun onInterrupt() {
        Log.w(TAG, "UssdAccessibilityService interrupted")

        // Android has interrupted an active Accessibility session after the
        // provider call may already have been dispatched. The financial
        // outcome is therefore ambiguous: never report a definite failure
        // that could encourage the agent to repeat a transaction.
        if (!isSessionActive) {
            return
        }

        listener?.onResult(
            "pending_confirmation",
            "Accessibility session interrupted before a final provider result"
        )

        endSession()
        UssdForegroundService.stop(this)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (!isSessionActive) return

        // Ignore accessibility noise that cannot represent a new USSD screen.
        if (
            event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        ) {
            return
        }

        val root = rootInActiveWindow ?: run {
            Log.w(TAG, "EVENT has no rootInActiveWindow")
            return
        }

        val rootPackage = root.packageName?.toString()

        // Never interpret AgentPro's own UI as provider USSD content.
        //
        // The transaction progress screen contains human-readable labels
        // such as "Waiting for PIN". Generic flow matchers may legitimately
        // contain similar phrases. Without this boundary, accessibility
        // events generated by our own Flutter UI can falsely advance the
        // USSD state machine before the network dialog even appears.
        //
        // Do not filter solely on event.packageName: some OEMs emit an event
        // from SystemUI while rootInActiveWindow still correctly points at
        // the phone/USSD dialog. The active root package is the boundary that
        // matters here.
        if (rootPackage == packageName) {
            return
        }

        val screenText = collectText(root).lowercase().trim()

        if (screenText.isEmpty()) {
            Log.w(TAG, "Active accessibility root contained no readable text")
            return
        }

        // A provider can terminate a generic flow before its expected PIN
        // boundary. MTN Pulse does this for allocations that are available
        // only in the MyMTN App. Terminal markers therefore have to be
        // recognised on every genuine provider USSD screen, not only after
        // the PIN prompt has been reached.
        if (pendingSteps != null) {
            val normalizedScreen = normalizeUssdText(screenText)

            val matchedSuccess = pendingSuccessMarkers
                ?.firstOrNull { marker ->
                    marker.isNotBlank() &&
                        normalizedScreen.contains(normalizeUssdText(marker))
                }

            val matchedFailure = pendingFailureMarkers
                ?.firstOrNull { marker ->
                    marker.isNotBlank() &&
                        normalizedScreen.contains(normalizeUssdText(marker))
                }

            if (matchedSuccess != null || matchedFailure != null) {
                val succeeded = matchedSuccess != null

                val message = when {
                    normalizedScreen.contains(
                        "only available on mymtn app"
                    ) ->
                        "This offer can only be purchased in the MyMTN App."

                    succeeded ->
                        "Provider reported success"

                    else ->
                        "Provider reported failure"
                }

                listener?.onResult(
                    if (succeeded) "success" else "failure",
                    message
                )

                endSession()
                UssdForegroundService.stop(this)
                return
            }
        }

        val now = SystemClock.elapsedRealtime()

        // Android may send the same USSD screen several times.
        // Process only the first one.
        if (
            screenText == lastScreenText &&
            now - lastScreenHandledAt < 150L
        ) {
            return
        }

        lastScreenText = screenText
        lastScreenHandledAt = now

        val isBusinessRoleMismatch =
            pendingProvider == "mtn" &&
                screenText.contains(
                    "not allowed to access this code"
                )

        if (isBusinessRoleMismatch) {
            val roleLabel = when (pendingBusinessSimRole) {
                "evd" -> "EVD"
                "merchant" -> "Merchant"
                else -> "Agent"
            }

            val message =
                "This MTN SIM is not authorized for the selected " +
                    "$roleLabel transaction. Select an MTN " +
                    "$roleLabel SIM and try again."

            listener?.onResult(
                "role_mismatch",
                message
            )

            endSession()
            UssdForegroundService.stop(this)
            return
        }

        when {
            reachedPinPrompt -> handleAfterPinPrompt(screenText)

            // Generic Flow Builder flows (Airtime, Data Bundle, Commission
            // types, Pay to Agent/Merchant, etc.) must be checked before any
            // of the legacy hardcoded MTN/Telecel conditions below. Those
            // were written for the original Cash In/Cash Out pilot and use
            // broad substring matches like screenText.contains("amount"),
            // which also match unrelated screens in newer flows (e.g.
            // Airtime Select Amount preset menu), silently hijacking them
            // and sending the typed amount into the wrong field entirely.
            // pendingSteps is only ever non-null for generic flows -
            // hardcoded MTN/Telecel sessions never set it.
            pendingSteps != null -> handleGenericStep(root, screenText)

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
                Log.d(TAG, "Telecel PIN prompt reached - all automated input stops here")
            }

            // ── Generic interpreter (new provider/type combos only -
            // never reached for MTN/Telecel, since their branches above
            // always match first) ──
        }
    }

    // PIN BOUNDARY:
    // Once the provider asks for the user's PIN, AgentPro becomes read-only.
    // The user manually enters the PIN and handles every provider screen that
    // follows. The service may only observe a final success/failure marker.
    //
    // This function deliberately receives only screenText, not the
    // Accessibility root node. That makes post-PIN input impossible here.
    private fun handleAfterPinPrompt(screenText: String) {
        // MTN/Telecel use the legacy hardcoded marker lists when custom
        // markers are absent. Generic flows use their configured markers.
        val successMarkers = pendingSuccessMarkers ?: listOf(
            "receive cash in",
            "cash in successful",
            "transaction successful",
            "successful",
            "received"
        )

        val failureMarkers = pendingFailureMarkers ?: listOf(
            "failed",
            "insufficient",
            "not found",
            "error"
        )

        // Android can display the same trailing "connection problem or
        // invalid MMI code" text after both genuine completion and abort.
        // The distinguishing signal already used by AgentPro is whether
        // "MMI complete" is also present.
        val hasConnectionProblemText =
            screenText.contains("connection problem") ||
                screenText.contains("invalid mmi code")

        val hasMmiComplete =
            screenText.contains("mmi complete")

        val isSuccess =
            successMarkers.any { screenText.contains(it) } ||
                (hasConnectionProblemText && hasMmiComplete)

        val isFailure =
            failureMarkers.any { screenText.contains(it) } ||
                (hasConnectionProblemText && !hasMmiComplete)

        if (isSuccess || isFailure) {
            listener?.onResult(
                if (isSuccess) "success" else "failure",
                if (isSuccess) {
                    "Provider reported success"
                } else {
                    "Provider reported failure"
                }
            )

            endSession()
            UssdForegroundService.stop(this)
        }
    }

    // Data-driven step matching for any provider/transaction_type not
    // covered by the hardcoded MTN/Telecel branches above. First
    // matching step wins (steps are already ordered by step_order),
    // mirroring the same top-to-bottom priority the hardcoded `when`
    // block above already uses.
    private fun normalizeUssdText(value: String): String =
        value.lowercase()
            .replace(Regex("\\s+"), " ")
            .trim()

    private fun hashUssdScreen(screenText: String): String {
        val normalized = normalizeUssdText(screenText)

        return MessageDigest.getInstance("SHA-256")
            .digest(normalized.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte ->
                "%02x".format(byte.toInt() and 0xff)
            }
    }

    private fun resetGenericFlowMismatchState() {
        genericFlowMismatchCount = 0
        lastMismatchScreenHash = null
        lastMismatchAt = 0L
    }

    private fun recordGenericFlowMismatch(
        root: AccessibilityNodeInfo,
        screenText: String
    ) {
        // Strictly pre-PIN. After PIN AgentPro remains read-only and the
        // existing post-PIN ambiguity handling remains authoritative.
        if (
            !isSessionActive ||
            reachedPinPrompt ||
            pendingSteps == null
        ) {
            return
        }

        // Do not interpret unrelated Phone/System UI as provider-menu
        // drift. AgentPro only counts mismatch evidence from the same
        // interactive structure it can actually automate: a text input plus
        // the USSD Send control.
        if (
            findByClassName(
                root,
                "android.widget.EditText"
            ) == null ||
            findByText(root, "send") == null
        ) {
            return
        }

        val now = SystemClock.elapsedRealtime()
        val screenHash = hashUssdScreen(screenText)

        // After AgentPro submits an expected step, Android can continue
        // publishing that old provider screen briefly while the network
        // advances. Do not count it as evidence of a new mismatch.
        if (
            screenHash == lastMatchedScreenHash &&
            now - lastMatchedScreenAt <
                RECENT_MATCH_SCREEN_GRACE_MS
        ) {
            return
        }

        // Rate-limit identical mismatch events so an Accessibility event
        // burst cannot consume the entire mismatch budget instantly.
        if (
            screenHash == lastMismatchScreenHash &&
            now - lastMismatchAt <
                REPEATED_MISMATCH_MIN_INTERVAL_MS
        ) {
            return
        }

        genericFlowMismatchCount += 1
        lastMismatchScreenHash = screenHash
        lastMismatchAt = now

        val provider = pendingProvider ?: "unknown"
        val transactionType =
            pendingTransactionType ?: "unknown"
        val stepCount = pendingSteps?.size ?: 0

        // SECURITY: never include screenText, customer phone, amount,
        // Operator ID, merchant ID, reference or PIN in this telemetry.
        Log.w(
            TAG,
            "FLOW_MISMATCH " +
                "provider=$provider " +
                "transaction_type=$transactionType " +
                "step_index=$currentStepIndex " +
                "step_count=$stepCount " +
                "mismatch_count=$genericFlowMismatchCount " +
                "screen_hash=$screenHash"
        )

        if (
            genericFlowMismatchCount <
            MAX_GENERIC_FLOW_MISMATCHES
        ) {
            return
        }

        listener?.onResult(
            "flow_mismatch",
            "Provider menu no longer matches the configured USSD flow"
        )

        endSession()
        UssdForegroundService.stop(this)
    }

    private fun handleGenericStep(root: AccessibilityNodeInfo, screenText: String) {
        val steps = pendingSteps ?: return
        val normalizedScreen =
            normalizeUssdText(screenText)
        // Only ever considers steps at or after currentStepIndex, and
        // advances past whichever step fires - critical because
        // matchAll conditions can be short, generic phrases (e.g.
        // "merchant id") that a LATER confirmation/PIN screen might
        // also happen to contain. Without this, re-scanning from step
        // 0 on every screen would re-fire an already-completed step
        // forever instead of ever reaching the real PIN prompt.
        for ((index, step) in steps.withIndex()) {
            if (index < currentStepIndex) continue
            if (
                step.matchAll.isNotEmpty() &&
                step.matchAll.all { marker ->
                    marker.isNotBlank() &&
                        normalizedScreen.contains(
                            normalizeUssdText(marker)
                        )
                }
            ) {
                lastMatchedScreenHash =
                    hashUssdScreen(screenText)
                lastMatchedScreenAt =
                    SystemClock.elapsedRealtime()
                resetGenericFlowMismatchState()

                val completed = when (step.action) {
                    "send_digit", "send_literal" ->
                        step.actionValue?.let { respond(root, it) } ?: false

                    "send_customer_phone" ->
                        pendingCustomerPhone?.let { respond(root, it) } ?: false

                    "send_amount" ->
                        pendingAmount?.let { respond(root, it) } ?: false

                    "send_operator_id" ->
                        pendingOperatorId?.let { respond(root, it) } ?: false

                    "send_reference" ->
                        pendingReference?.let { respond(root, it) } ?: false

                    "send_merchant_id" ->
                        pendingMerchantId?.let { respond(root, it) } ?: false

                    "send_selection" -> {
                        val digit = pendingSelections?.get(index.toString())
                        if (digit != null) {
                            respond(root, digit)
                        } else {
                            Log.w(
                                TAG,
                                "send_selection at step index $index has no selection provided — session will stall"
                            )
                            false
                        }
                    }

                    "pin_prompt" -> {
                        reachedPinPrompt = true
                        listener?.onPinPromptReached()
                        Log.d(TAG, "Generic flow: PIN prompt reached")
                        true
                    }

                    // Legacy/configured post-PIN auto-confirm actions
                    // are intentionally inert on-device. Once pin_prompt
                    // fires, handleGenericStep() is no longer entered.
                    "auto_confirm_once" -> false

                    else -> {
                        Log.w(TAG, "Unsupported generic USSD action: ${step.action}")
                        false
                    }
                }

                if (completed) {
                    currentStepIndex = index + 1
                } else {
                    Log.d(
                        TAG,
                        "Generic flow step $index was not submitted; waiting for another accessibility event"
                    )
                }

                return
            }
        }

        // No configured remaining step matched this genuine provider screen.
        // Collect bounded evidence instead of stalling indefinitely.
        recordGenericFlowMismatch(root, screenText)

    }

    // Finds the single EditText on screen, sets its text, then finds and
    // clicks the Send button. Returns true only when the value was actually
    // submitted. Flow progression and one-shot confirmation state must only
    // advance after a true result.
    //
    // Only ever called for pre-PIN menu digits, phone numbers, amounts,
    // Operator ID, references, and selections. It is never called for PIN
    // entry or for any provider screen after the PIN boundary.
    private fun respond(root: AccessibilityNodeInfo, value: String): Boolean {
        val now = SystemClock.elapsedRealtime()

        // Prevent duplicate submissions caused by repeated Android
        // accessibility events after a successful response.
        if (
            value == lastResponseValue &&
            currentStepIndex == lastResponseStepIndex &&
            now - lastResponseAt < 500L
        ) {
            Log.d(TAG, "Ignored duplicate USSD response for the same flow step")
            return false
        }

        val editText = findByClassName(root, "android.widget.EditText") ?: run {
            Log.w(TAG, "No EditText found on screen")
            return false
        }

        val args = Bundle()
        args.putCharSequence(
            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
            value
        )

        val textSet = editText.performAction(
            AccessibilityNodeInfo.ACTION_SET_TEXT,
            args
        )

        if (!textSet) {
            Log.w(TAG, "USSD input field rejected ACTION_SET_TEXT")
            return false
        }

        val sendButton = findByText(root, "send")
        if (sendButton == null) {
            Log.w(TAG, "No Send button found on screen")
            return false
        }

        val clicked = sendButton.performAction(
            AccessibilityNodeInfo.ACTION_CLICK
        )

        if (!clicked) {
            Log.w(TAG, "USSD Send button rejected ACTION_CLICK")
            return false
        }

        lastResponseValue = value
        lastResponseAt = now
        lastResponseStepIndex = currentStepIndex
        return true
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
        // Fail closed around password/PIN fields. Even if an OEM exposes
        // password-node text through Accessibility, AgentPro must never read
        // or retain that node or anything beneath it.
        if (node.isPassword) {
            return ""
        }

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
