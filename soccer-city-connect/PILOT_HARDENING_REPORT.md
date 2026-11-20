# Pilot foundation build and validation report

November 20, 2026. Continued the existing `shawteone1/Soccer-Center` checkout on `codex/soccer-city-connect-poc`, starting from verified clean commit `a02c488ee431b78f6b2d6ebc421529f138157c6c` (descendant of original c478169). No applicable AGENTS.md was found. No subsequent/uncommitted work existed at the start. All changes remain under `soccer-city-connect/`.

## Delivered

- Resumable guided onboarding and a connection center inside the existing administrator portal; no replacement portal or redesign.
- Explicit member-association review, keep-separate/correction, configurable ownership/deadlines and retained source/local task separation.
- Documented provider-specific read foundations with minimal projection, tenant/account-scoped keys, paging, incremental support only where verified, bounded retries/timeouts/Retry-After, atomic import/checkpoint behavior and access/freshness handling.
- An opt-in local backend serving the same compiled app: isolated durable SQLite, explicit staff provisioning, scrypt/session/CSRF/role/tenant controls, encrypted server credential interface, Square Sandbox PKCE/state/denial/refresh and safe read transports. No default accounts, roles or keys.
- Updated fictional interactive preview and responsive captures. The original member portal, source fixtures and baseline tests are preserved.

[Open/download the updated interactive preview](artifacts/operations-desk-preview.html). Save and open in a browser; no server required. This is fictional client-demo mode, not the authenticated backend. For local startup and the full walkthrough use [Capabilities, startup and activation checklist](docs/CAPABILITIES_AND_ACTIVATION.md). For provider contracts, official URLs, review date, restrictions and uncertainty use [Integration feasibility](docs/INTEGRATION_FEASIBILITY.md).

## Persistence/authentication assessment

The repository's established production database uses MySQL/Drizzle and its auth configuration imports that database and production-oriented settings (`src/server/db/client.ts`, `src/lib/auth/auth.ts`, `src/server/auth-policy.ts`). Reusing those instances would compromise the requested isolation. They were read but not changed or connected. The isolated foundation follows the repository's Express/TypeScript/Zod and centralized server authorization concepts, with local SQLite and no new production dependency/configuration.

Client demo state remains under the existing storage key, upgrading old snapshots without losing records/tasks/resolutions/history. The opt-in authenticated backend uses server state and HttpOnly sessions instead; it does not persist operational state or credentials in browser storage. Every API command is schema-validated, permission-checked and recomputed server-side. Client-supplied actors, source state and privileges are not accepted. Audit actor comes from authenticated identity. Separate host access-provisioning audit records local membership changes.

## Exact validation and evidence

Commands from `/workspace/soccer-city-connect/soccer-city-connect`:

| Classification | Command | Result |
| --- | --- | --- |
| Type check | `npm run type-check` | Passed, exit 0. [Log](artifacts/pilot-typecheck.txt) |
| Automated local/fixture tests | `npm test` | **35 passed, six files**. Original 13 functional tests retained. Includes seven provider contract-fixture cases, backend/CLI security, migration, rules and association cases. [Log](artifacts/pilot-functional-tests.txt) |
| Browser tests | `PLAYWRIGHT_BROWSERS_PATH=/tmp/scc-browsers npm run test:browser` | **13 Chromium journeys passed**. Includes all original eight journeys and five onboarding/backend/device journeys. [Log](artifacts/pilot-browser-tests.txt) |
| Isolated build and export | Browser pretest runs `npm run preview:export` (`npm run build` + export guard) | Passed; fictional standalone HTML generated and browser-tested from file://. Build output is in the browser log. |
| Actual provider Sandbox tests | None | **Not run**: no authorized provider credentials/app/test-account configuration was available. |
| Live tests | None | **Not run**: explicitly disabled. |

Tests cover:

- Resuming setup after refresh, provider selection, scope preview and readiness; explicit association confirmation/correction and member view consistency.
- Durable state/audit/session after database close/reopen, API login/CSRF/cookie rules, viewer/operator restrictions, forged privilege rejection, cross-organization denial and stale revisions.
- Provider/account/tenant collisions, duplicate imports/tasks, all-page commit, partial failure retaining checkpoint/last-known records/local task resolution, incremental request filters and timezone-aware rule deadlines.
- Numbered/offset/cursor paging, repeated cursor rejection, 429 delta/date Retry-After, long deferral and premature retry rejection, bounded 5xx/timeout retries, denied/expired/revoked access and disconnect retention.
- Vault encryption/AAD, missing/wrong-key rejection, redaction, no token in state/errors, PKCE session/tenant state binding, replay/expiry/denial and refresh rotation; host-admin CLI role requirement and encrypted public-sandbox credential import.
- Existing complete member/admin resolution workflow, refresh/two-tab behavior, source references, history, reset, read-only ownership and no external/provider requests in demo journeys.
- Desktop 1440×1000, iPad portrait 768×1024, iPad landscape 1024×768 and phone 390×844. These are Chromium viewport checks, not physical Safari/iPadOS certification.
- Self-contained export with no HTTP requests; runtime-generated backend login password absent from export. The export script rejects server-code/key-material markers. No private database or credential file is included.

Screenshots: [connection center desktop](artifacts/connection-center-desktop.png), [iPad portrait](artifacts/setup-iPad-portrait.png), [iPad landscape](artifacts/setup-iPad-landscape.png), [phone](artifacts/setup-phone.png). Desktop connection center and a tablet/phone capture were visually inspected. This is not comprehensive accessibility certification.

## Repository-wide checks — inherited failures remain

Commands from `/workspace/soccer-city-connect` were rerun against unchanged production source/configuration:

| Command | Actual result |
| --- | --- |
| `npm run type-check` | Failed: same missing `format-overrides-plugin`, `export-plugins/utils/text-size`, `@airo/content` modules. [Log](artifacts/pilot-repository-typecheck.txt) |
| `npm run build` | Failed: absent `content-lib/src/index.ts` imported by soccer-directory; SSR stage not reached. [Log](artifacts/pilot-repository-build.txt) |
| `npm test -- --run --exclude 'soccer-city-connect/**'` | Same baseline **90 files passed / 7 failed; 732 tests passed / 10 failed**. Missing format/uk-education modules and three tryouts visible-total assertions. [Log](artifacts/pilot-repository-tests.txt) |

No production routes, database/auth instances, root manifests/lockfile, deployment configuration, Arena Pathway or unrelated PlayRcmd source were changed. These inherited failures prevent a full production no-regression certification; they were not represented as passing or repaired outside scope.

## Limits and precise next actions

All feasible implementation and local/fixture validation for this credential-free, isolated round is complete. This does **not** mean the application is ready for production or that adding credentials completes a pilot.

Remaining external dependencies and qualification work are itemized in [Capabilities and activation](docs/CAPABILITIES_AND_ACTIVATION.md): actual developer/test accounts and permissions; Playpass safe-test-facility/plan decision; Soccer City data ownership, identity evidence, scope and staff decisions; hosted TLS/identity/MFA/recovery; key ownership/rotation/backups; actual Sandbox reconciliation; deletion/lifecycle/scheduler/monitoring qualification; and explicit pilot/live approval. Existing native transports remain disabled by default; live mode cannot be selected or executed.

No developer account was created, provider agreement accepted, live credential obtained, real customer record accessed, payment/refund made, provider record written or outbound message sent. No push, merge, deployment or publishing. The final local commit SHA and clean-tree status are reported in the conversation and available through `git log -1` / `git status`.
