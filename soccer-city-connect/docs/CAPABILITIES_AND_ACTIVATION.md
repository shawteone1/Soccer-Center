# Implemented capabilities and exact activation dependencies

November 20, 2026. This is an isolated development foundation using fictional data, **not production-ready**. Customer credentials alone do not complete qualification.

| Area | Implemented now | Outstanding exact dependency |
| --- | --- | --- |
| Existing application | Extends a02c488; preserves member portal, Operations Desk, simulated adapters and tests. | Soccer City approval of actual operational scope. No replacement/migration implied. |
| Onboarding | Six resumable steps: organization/locations/timezone; planned staff roles/defaults; independent providers; import/scope preview; explicit associations; readiness/next action. | Actual location/account/program IDs and staff directory. Planned roles do not grant backend privileges. |
| Connection center | Mode separate from authorization/import health; source/history, disconnect, reauthorization/dependency paths, retry and stale/access warnings. | Real account/scopes verification. Saved settings, credential storage or fixture success never show connected. |
| Identity review | Explicit confirm, keep separate and correction; member projection changes without source mutation. | Approved independent family/participant evidence and review policy. No name/email/payment matching. |
| Task rules | Configurable default owner and timezone-aware calendar-day deadline; repeated imports preserve completion and notes; actor/source audit. | Real roster, escalation and follow-up policies. Demo defaults use fixture clock; backend uses server clock. Preserved activity calendar explicitly remains America/Denver. |
| Persistence | Tenant-scoped SQLite WAL; durable setup/tasks/mappings/history, checkpoints and sessions; optimistic revision checks. | Hosting, backup/restore, retention, migrations and multi-instance strategy. No production DB connected. |
| Staff security | Explicit host-admin provisioning, scrypt hashes, expiring opaque HttpOnly sessions, CSRF/origin checks and server-side admin/operator/viewer/tenant membership. Separate access-provisioning audit. | Identity provider/SSO/MFA/recovery, real-staff lifecycle, HTTPS hosting and Secure cookie policy. No signup/default accounts/fallback authentication. |
| Secrets | Server-only AES-256-GCM envelopes with tenant/provider/account AAD; no default key; fixed-code errors and redaction; no browser credential persistence/export. | Approved key manager, rotation/re-encryption, backup and revocation procedures. Operational SQLite data has restrictive file permissions, not full database encryption. |
| Mindbody | Read/projection/paging/incremental client foundation, public-sandbox-only transport and encrypted credential-import CLI. | Approved developer account/key and staff permissions, actual Sandbox tests and live approval/owner activation later. |
| Playpass | Organizer registration/schedule contracts and fixture coverage. | Verified safe test environment or approved test organizer, plan/token eligibility, and separately reviewed native transport activation. No dedicated sandbox verified. |
| Square | Sandbox-only read client and PKCE state/callback/denial/refresh foundations. | Approved app/test seller, exact callback, secure config and real scopes/account qualification. No actual Sandbox tests yet. |
| Lifecycle | Disconnect/revocation clears local credentials; long Retry-After defers server imports; source freshness/error history visible. | Provider-console remote revocation, signed webhooks, unattended refresh/sync scheduling and operational alerting. |
| Export | Self-contained fictional preview; server-code/key-material export guard; runtime test password checked absent. | Preview is not an authenticated backend or hosted pilot. |

## Existing demo and walkthrough

```bash
cd /workspace/soccer-city-connect/soccer-city-connect
npm run dev
# http://127.0.0.1:5187/#admin
```

Choose **Open setup & connections**. Save each step to resume after refresh. Select providers independently; source preview is fictional and authenticates nothing. Review an association with a reason, then correct it with **Keep separate / undo association**. Finish readiness review and inspect Connection center. Exercise disconnect/reauthorization; source status and local task completion remain separate.

Download [the interactive preview](../artifacts/operations-desk-preview.html), save it and open in a modern browser. The onboarding/connection workflow works without a server and contains no actual customer records or credentials. Browser file-storage behavior varies; localhost is preferred for persistence. Demo reset touches only this app's storage.

## Authenticated backend mode of the same app

Node >=22.22 required; tested on Node 24.22.1. Dependencies already exist in this workspace.

```bash
cd /workspace/soccer-city-connect/soccer-city-connect
export SCC_BOOTSTRAP_ORG=fictional-pilot
export SCC_BOOTSTRAP_USER=local-admin
export SCC_BOOTSTRAP_ROLE=admin
read -rsp 'Choose a local staff password (12+ characters): ' SCC_BOOTSTRAP_PASSWORD
export SCC_BOOTSTRAP_PASSWORD
npm run pilot:provision
unset SCC_BOOTSTRAP_PASSWORD
npm run preview:export
npm run pilot:serve
# http://127.0.0.1:5188/?pilot=1
```

No default users, passwords or roles are provisioned. Explicitly provision operator/viewer memberships through the same host-admin process. Reprovisioning revokes existing sessions. Local staff role comes from the server, not the demonstration selector. Enter the chosen user and permitted organization. Sessions use HttpOnly/SameSite cookies and an in-memory CSRF token; provider tokens never reach the browser.

The backend binds loopback with a strict local Origin policy and serves the existing compiled portal. The URL without `?pilot=1` remains an explicitly fictional client demo; it cannot bypass API authorization. State persists in `.pilot/development.sqlite`. `SCC_DB_PATH` may select a .sqlite under this app's `.pilot/` or OS temporary directory; runtime/CLI reject other paths. Never use production data. Backend reset preserves durable audit, resets fictional state and clears local provider secrets/checkpoints. Revision conflicts reject stale edits instead of silently overwriting them.

## Ordered activation checklist

1. **Soccer City sponsor:** confirm actual provider use and record ownership, three principal operational problems, locations/programs, staff roster, pilot cohort/duration and numeric success criteria. No purchase/pilot commitment is assumed.
2. **Data/identity policy:** approve minimum fields, independent family/participant evidence, ambiguity corrections, retention/deletion, access rules and processing terms. Names, shared email and payments never establish identity.
3. **Hosting/identity:** choose isolated hosting/database/backups, HTTPS origin/callbacks, Secure cookies, identity provider/MFA/recovery and staff lifecycle. Current runtime intentionally rejects non-local origins; reviewed configuration/code and deployment testing are required. Local passwords/SQLite are an executable foundation, not hosting qualification.
4. **Key owner:** configure an approved secret manager or secure key-file owner, rotation, backup and incident process. For local testing only, generate a 32-byte key once; never overwrite or commit it:

```bash
umask 077
mkdir -p .pilot
node -e "require('fs').writeFileSync('.pilot/master.key',require('crypto').randomBytes(32).toString('base64'),{flag:'wx',mode:0o600})"
export SCC_MASTER_KEY_FILE="$PWD/.pilot/master.key"
```

5. **Mindbody developer/owner:** obtain an approved developer account, public-sandbox site -99 API key and any required staff token. Codex did not create an account or accept terms. Host admin can import an existing authorized credential file with `SCC_CREDENTIAL_FILE`, `SCC_CREDENTIAL_ORG` and `npm run pilot:credential`. Strict JSON fields: provider=Mindbody, account=-99, apiKey, optional token. Keep the input in secure configuration. Encryption does not verify authorization. Revalidate current auth requirements and execute actual public-Sandbox reads before broader use.
6. **Square developer/test seller:** approve an app and test seller; register exactly `http://127.0.0.1:5188/pilot-api/oauth/square/callback`; configure `SCC_SQUARE_SANDBOX_CLIENT_ID` and the key file. Enable only approved Sandbox transports with `SCC_ENABLE_SANDBOX=Square` or `Square,Mindbody`. Select Sandbox in onboarding, then **Prepare Square sandbox authorization**. The consenting seller signs in themselves. Verifier/tokens remain server-side, state is one-use and session/tenant-bound, and callback redirects away from the code URL. Returned merchant ID is stored as an unverified account reference. Confirm permitted location IDs and run approved read categories. Test real denial, refresh rotation, revocation and permission changes. No payments or financial mutations.
7. **Playpass test-facility dependency:** obtain official confirmation of a safe test environment or an explicitly approved test organizer and API plan eligibility. Obtain organizer-owner authorization for the smallest token permissions. Do not reuse player OAuth. Native production-host access is deliberately absent; a separate reviewed transport activation is required after the safe-test decision. Merely adding credentials cannot enable it.
8. **Provider qualification:** run actual authorized Sandbox tests; reconcile counts, statuses, account/location/program scope and identity boundaries with provider screens; verify minimal projection and fix schema/version differences. Validate deletion/reconciliation behavior. Current contract fixtures do not satisfy this step.
9. **Operational ownership:** approve assignees, deadlines, escalations, audit access and provider outage/reauthorization procedures. Qualify a durable scheduler, monitoring/alerts, refresh lifecycle and key/backup recovery before unattended use. Current sync/refresh is explicit/manual.
10. **Pilot approval:** collect baseline measurements and integration/provider costs; obtain explicit Soccer City read-only access approval and separately review hosting/identity. Live mode stays disabled. No write-back, payments/refunds, outbound messages or production deployment is included.

No secure provider credentials were present, so actual provider Sandbox and live steps were not executed. Sandbox flags never bypass account authorization. Disconnect removes local credentials; upstream grants may still require provider-console revocation. Never put provider tokens in browser storage, source, reports or exported previews.

## ROI proposal — no measured savings

Measure actual task volumes, systems accessed, re-entry, mismatches, active staff time, elapsed handling, support inquiries and member completion before/during a pilot. Include implementation/training, provider/API licensing, hosting, maintenance and exception-handling costs. Separate labor capacity value from cash savings; use observed values for net ROI. Demo counters/timings are not Soccer City operating results.
