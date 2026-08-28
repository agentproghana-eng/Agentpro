# AgentPro — Project Status Report
Generated at end of build session | For whoever picks this up next

---

## TL;DR

This is a substantial, mostly-complete FinTech mobile money platform: Node.js backend,
Flutter Android app, React admin portal. It has been through multiple deliberate
security and correctness audits, not just a single build pass. The single biggest
open risk is that **USSD dial strings are unverified placeholders** — nothing else
matters if those don't work against live MTN/Telecel/AT networks. Read
`docs/DEPLOYMENT.md` before doing anything else.

---

## What's Genuinely Solid

These were built, then independently re-verified in later passes — not just written once and assumed correct:

- **Auth & access control**: JWT + refresh tokens, RBAC, two real IDOR vulnerabilities
  found and fixed (cross-company user/branch access), brute-force rate limiting added
  to auth endpoints.
- **Transaction atomicity**: float debits, commission calculation, and user creation
  are wrapped in real DB transactions — one gap here (`createUser`) was found and
  fixed mid-session.
- **Commission math**: stress-tested against 9,000+ input combinations for
  floating-point correctness; a real cent-level discrepancy between the admin
  portal's preview and actual backend payout was found and fixed this way, not by
  inspection.
- **USSD PIN safety**: verified architecturally impossible for a PIN to be captured,
  logged, or transmitted anywhere in the app — there is no PIN text field anywhere
  in the Flutter UI, and both the Flutter engine and backend independently sanitize
  session logs as defense-in-depth. This was tested end-to-end via a mocked platform
  channel, not just read-through.
- **Android permission chain**: `CALL_PHONE`/`READ_PHONE_STATE` runtime requests,
  and the two most safety-critical `SubscriptionManager` calls (which SIM slot a
  transaction actually dials on) verified against actual AOSP source/Javadoc, not
  general recollection.
- **FCM notification routing**: was silently broken (missing Android intent-filter
  meant notification taps never deep-linked anywhere when the app was backgrounded)
  — found and fixed.

---

## The USSD Architecture — Read This Carefully

The original build attempted step-by-step USSD menu navigation (dial, read menu,
select option, read next menu, etc.). **This was fundamentally broken** — Android's
public `TelephonyManager.sendUssdRequest()` API is single request → single response;
there is no API for a third-party app to reply to an already-open interactive USSD
session. This was confirmed against multiple independent sources including a
purpose-built library reporting the exact same limitation.

The app was redesigned around **single concatenated dial strings**
(e.g. `*170*1*2*{customer_phone}*{amount}#`, dialed as one request) instead. This is
the standard approach real USSD-automation apps use without Android's
AccessibilityService (which this app deliberately avoids). See
`backend/migrations/002_ussd_single_dial_redesign.sql` for the full rationale.

**What this means for you:**
- The exact digit sequences in `backend/scripts/seed.js` (which menu option is
  "Cash Out" vs "Send Money" for each provider) are **best-effort placeholders**,
  not verified against live networks. Operator menus also change periodically.
- Whether a given provider's menu even *accepts* a fully concatenated string at all
  (vs. requiring genuine interactive navigation for some transaction types) is
  something **only real-device testing against live SIMs can answer**. This cannot
  be verified from documentation or in this development environment.
- The app handles PIN entry by pausing and letting the OS/network manage that one
  exchange — whether Android reliably delivers a second callback after a PIN prompt
  resolves is not something even Android's own documentation guarantees uniformly
  across OEMs. When it doesn't, the app reports `pending_confirmation` (a real,
  distinct transaction status) rather than falsely guessing success or failure.
  **Do not "simplify" this back to a binary success/fail** — it exists specifically
  to avoid telling an agent a transaction failed when money may have actually moved.

**Action item before any real deployment**: get physical SIMs for MTN, Telecel, and
AT Money, and manually verify each seeded USSD pattern actually works as intended
using the admin portal's live template editor (changes take effect without an app
update).

---

## Known Placeholder / Unbuilt Areas

Intentionally left as honest stubs rather than rushed:

- **In-app commission rules screen** (business owner view) — currently shows a
  message directing to the admin/superuser side, since owners can't self-serve this.
- **Ad photo/image upload** — `image_picker` dependency exists but is unused; the
  `CAMERA` permission was deliberately *removed* since nothing currently uses it
  (Play Store flags unused dangerous permissions). Add both back together if this
  feature gets built.
- **Branch detail deep-editing** from the manager dashboard tap — currently a no-op
  in one spot (see `manager_dashboard.dart`), since the fuller branch management
  flow lives in the standalone `/branches` screen instead.

---

## Things Verified Correct That Might Look Suspicious

So you don't waste time re-investigating these:

- `USSDEngine.retryCount` only retries a **clean no-response timeout on the initial
  dial** — it deliberately never retries after a PIN prompt has been seen, even if
  `retry_count` is set higher. This is intentional, not a bug (see code comments in
  `ussd_service.dart`).
- `pending_confirmation` transactions never update float balances or commission —
  also intentional, for the same "we don't actually know what happened" reason.
- The receipt PDF generator refuses to generate anything for non-`success`
  transactions, even though nothing currently calls it that way — this is
  deliberate defense-in-depth against a future caller forgetting to check status
  first, since a wrongly-labeled receipt is a worse failure mode than most.

---

## Verification Method Note

Significant parts of this session's later work (SQL migration correctness, some
Kotlin/Dart changes) were verified via careful manual tracing, mechanical checks
(brace/paren balancing), and `node --check` where the file type allowed it — **not**
by actually running the code, since this environment has no network access (no
package registries, no way to install Postgres, no JSX compiler available) and no
running Postgres/Android emulator. This was **not** silently glossed over — it's
flagged in the commit history of this conversation and here again. Treat anything
database- or Flutter-execution-dependent as needing a real test run before trusting
it fully, even though it was checked as rigorously as this environment allowed.

---

## Recommended Next Steps, In Order

1. **Get this running locally** per `QUICKSTART.md` — a fresh clone, migrated,
   seeded database, and both apps running against it.
2. **Live-test USSD templates** against real SIMs (see above) — this blocks
   everything else that matters.
3. **Third-party security review** before handling real money — this session's
   audits were thorough but are not a substitute for independent review.
4. Only then: build out the remaining stub screens, Play Store submission prep,
   etc., per the original `README.md` roadmap.

---

*This report reflects the state of the codebase as of the end of an extended,
multi-session build-and-audit process. It is meant to be read before continuing
work, not skimmed.*
