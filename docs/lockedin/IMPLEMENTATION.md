# LockedIn implementation status

Branch: codex/lockedin-platform. Base: 11de067 (GoDaddy source import).
This baseline has not been established as identical to current production.

Implemented: server-only disclosure filtering and consent checks; deny-by-default
provider boundaries; Box direct upload transport with bounded requests, opaque
filenames and reference-only results. Tests use injected transport responses.
No live provider calls have been validated. No UI, persistent workflow, queue,
OAuth flow or production integration is delivered by this initial change.

Required integration inputs:
- NSID partner API contract, sandbox credentials, supported verification scopes,
  webhook authentication, acceptance and expiry rules.
- Box application and authorization model, sandbox folder/account, retention,
  access and healthcare handling requirements. Keep tokens in server secrets.
- Fiserv product selection, sandbox merchant account and hosted tokenization
  contract. Tokens may be merchant-scoped; never assume portability to clubs.
- Test database and application authentication configuration.

Next implementation gates:
1. Reconcile source with deployed Soccer Center and preserve current demo.
2. Persistent consent, verification, document reference, payment reference,
   delivery and audit records with ownership checks and migrations.
3. Authenticated player-profile LockedIn section; same-origin mutation guards,
   upload limits and scanning, no raw ID/card collection.
4. Implement vendor-approved authorization and authenticated callbacks with
   replay protection. Test real sandbox journeys and expiry/revocation.
5. Durable outbox with idempotency, delivery receipts, ambiguous-delivery review,
   bounded retries and rechecking consent before every attempt.
6. Integrate one authorized club API or reviewed import script. No arbitrary
   remote URLs, browser credential scripting or automatic PII exports.

References:
- https://developer.box.com/reference/post-files-content/
- https://developer.fiserv.com/product/CardPointe/docs/documentation/CardSecure.md/
  (one possible Fiserv family, not selected for this implementation).
- NSID API details remain pending partner documentation.

Run initial tests: node --test src/server/lockedin/core.test.mjs
