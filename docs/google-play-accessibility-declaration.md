# AgentPro Google Play Accessibility Declaration

## Classification

AgentPro is **not** an accessibility tool intended to assist users with
disabilities. `isAccessibilityTool` must remain `false`.

## Core permitted use

AgentPro provides user-initiated USSD automation for supported mobile-money
and telecom transactions.

A user starts a transaction in AgentPro and supplies the required non-PIN
transaction information. During that active session, the Accessibility
Service reads the Android USSD dialog to identify the provider menu and
interacts with its text field and Send control to enter the menu choices and
non-PIN values required by that specific transaction.

Automation stops at the Mobile Money PIN prompt. The user enters the PIN
manually. AgentPro does not store or auto-enter the PIN.

After the PIN boundary, the service is read-only and may observe only enough
provider text to determine whether the provider reported success, failure, or
an ambiguous outcome.

## Accessibility data accessed

During a user-started USSD automation session, AgentPro can access:

- USSD menu and prompt text.
- Interactive USSD controls required to continue the menu.
- Transaction information echoed by the network, which may include phone,
  customer, merchant, or operator identifiers and transaction amounts.
- Provider success, failure, or other terminal result text.

Password/PIN Accessibility nodes are explicitly excluded from text
collection.

## Data handling

Raw USSD screen text is processed on-device in memory for the active
automation session and cleared when the session ends.

Raw USSD screen text is not uploaded to AgentPro servers and is not used for
advertising or profiling.

The automation returns only a bounded transaction outcome to the AgentPro
transaction flow, such as success, failure, pending confirmation, or flow
mismatch.

## User consent flow

Accessibility Service is optional and does not gate AgentPro cold launch,
login, account access, or features that do not require automated USSD.

When a user starts an automated USSD transaction and AgentPro detects that
the Accessibility Service is disabled, AgentPro displays a separate prominent
disclosure immediately before offering to open Android Accessibility Settings.

The disclosure explains:

1. Why Accessibility Service is needed for the user-started automation.
2. What USSD/window content it accesses.
3. How that content is used.
4. How raw USSD content is handled.
5. The Mobile Money PIN boundary.
6. That enabling the service is optional.

The user must affirmatively tap **Continue to Settings** before AgentPro may
open Android Accessibility Settings.

If the user taps **Not Now**, presses Back, or otherwise does not affirmatively
consent, AgentPro does not open Accessibility Settings and does not start the
USSD automation. No USSD request is sent.

After enabling the service in Android Settings, the user returns to AgentPro
and explicitly starts the transaction again. AgentPro does not automatically
resume or dispatch a financial transaction merely because Accessibility was
enabled.

## Suggested Play Store listing disclosure

AgentPro includes optional, user-initiated USSD automation. When enabled,
Android Accessibility Service is used during an active USSD transaction to
read the network's USSD menu and interact with menu controls so AgentPro can
enter non-PIN transaction details provided by the user. Automated input stops
at the Mobile Money PIN prompt and PIN entry remains manual.

## Play Console declaration wording

### Feature requiring AccessibilityService

User-initiated USSD transaction automation.

### Why AccessibilityService is required

Supported mobile-money USSD sessions are interactive and cannot be completed
with a single pre-composed dial string. AgentPro must identify each USSD menu
shown by Android and interact with that dialog to enter the non-PIN menu
choice or transaction value that the user already supplied.

The service is active for automation only after the user starts a transaction.
It does not autonomously initiate transactions.

### Data accessed and use

The service accesses text and interactive controls in the active USSD dialog,
including menu prompts, transaction information shown by the provider, and
final status messages. This content is processed on-device to determine the
current USSD step and submit the appropriate non-PIN response.

Raw USSD screen text is not uploaded to AgentPro servers.

Mobile Money PIN entry is manual. AgentPro does not store or auto-enter the
PIN.

## Review video checklist

The Play review video should show, without exposing a real PIN:

1. Open AgentPro.
2. Show the full prominent Accessibility disclosure.
3. Slowly scroll if the disclosure does not fit on one screen.
4. Show the **Not Now** path.
5. Trigger the disclosure again.
6. Tap **Continue to Settings**.
7. Enable **AgentPro USSD Automation** in Android Accessibility Settings.
8. Return to AgentPro.
9. Start a supported USSD automation from inside AgentPro.
10. Show AgentPro navigating the provider's USSD steps.
11. Show automation stopping when the PIN prompt is reached.
12. Do not type or reveal a real Mobile Money PIN in the review recording.
