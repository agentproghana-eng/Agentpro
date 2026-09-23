# Telecel Merchant Send Money

## Same-network — verified on physical Telecel Merchant SIM

Dial:

`*110#`

Observed sequence:

1. `Send Money`
2. `Telecel`
3. `To enter recipient number`
4. Enter recipient phone number
5. Enter amount
6. Enter reference
7. Enter Operator ID
8. Stop at the Telecel PIN prompt

The PIN screen displays transaction confirmation information including
amount, recipient, fee and reference.

AgentPro MUST NOT store, log, retrieve, or auto-enter the Telecel
transaction PIN.

AgentPro may automatically supply the saved protected Operator ID.

## Other Network

This is a separate Telecel Merchant operation. It must not use the
Personal Telecel transaction flow.

Known Merchant sequence includes Operator ID and Organisation Shortcode.
Its implementation must preserve the verified Merchant ordering.

## Credential security

For both Telecel Agent and Telecel Merchant:

- Operator ID is masked after saving.
- Organisation Shortcode is masked after saving.
- Neither credential is returned in ordinary user/profile payloads.
- Reveal/change requires Android device authentication.
- Device authentication may use biometrics or the phone PIN/pattern/password.
- AgentPro app/transaction PIN is not the credential-unlock mechanism.
- Credentials must not appear in logs, analytics, crash reports,
  transaction history, or transaction result screens.
- Telecel transaction PIN is never stored.
