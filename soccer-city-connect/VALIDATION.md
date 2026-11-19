# Build and validation report — November 13, 2026

Historical baseline for c478169. For the November 19 Operations Desk continuation, current screenshots, preview and validation results, see [OPERATIONS_DESK_HANDOFF.md](OPERATIONS_DESK_HANDOFF.md).

## Scope verified

- Workspace: `/workspace/soccer-city-connect`; branch: `codex/soccer-city-connect-poc`.
- Planning commit verified: `67e2e18a2a94634a88458ff846095b3cc2a540ca`; source base: `11de067414e63c5d3e3e221dfc14cc026dfbd8d0`.
- Checkout was clean before implementation. No applicable AGENTS.md was found in the checkout or ancestor locations.
- All implementation additions are in `soccer-city-connect/`; no previously tracked application file, production route/database/configuration, credential or Arena Pathway file was changed.
- Local-only work; no push, merge, deployment or publication.

## Successful prototype checks

Commands below ran from `/workspace/soccer-city-connect/soccer-city-connect`.

| Command | Actual final result | Evidence |
| --- | --- | --- |
| `npm run type-check` | Exit 0 | [Type check](artifacts/typecheck.txt) |
| `npm test` | Exit 0; 8 tests passed, 1 file | [Functional tests](artifacts/functional-tests.txt) |
| `npm run build` | Exit 0; isolated client bundle built | [Build](artifacts/build.txt) |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/scc-browsers npm run test:browser` | Exit 0; 4 Chromium tests passed, 6.9s | [Browser tests](artifacts/browser-tests.txt) |

The first isolated type check found an unused import; it was corrected before successful validation. The last functional/build/browser runs include the overlap-review addition and final source formatting.

Functional tests cover deterministic fixtures, exact family/participant links and unrelated same-name identity separation; provider/account/type keys; source metadata; separate Square transaction and enrollment; repeated refresh without duplicates; resolution surviving refresh with provider status unchanged; idempotent local resolution; failed sync preserving records; bounded retries/new cycles and audit; reset seed state; Denver date/time and participant/field overlaps.

Chromium tests cover:

1. Full member/admin journey with source IDs, active membership, program and camp references, simulated registration/booking notices, waiver resolution, unchanged provider warning, history, two-tab update, refresh/navigation persistence, repeated sync, failure/retry and reset preserving unrelated storage. The walkthrough asserts **zero external-host or `/api/` requests** and no browser page errors.
2. Member/program/source-ID search, no-match handling, calendar provider filter and month navigation, three-attempt exhaustion, deliberate new cycle and stale warning.
3. Both portals at 390×844 with no horizontal page overflow, keyboard source inspection and mobile screenshots; desktop capture uses 1440×1000.
4. Corrupt JSON storage recovery.

[Member desktop](artifacts/member-desktop.png), [admin desktop](artifacts/admin-desktop.png), [member mobile](artifacts/member-mobile.png) and [admin mobile](artifacts/admin-mobile.png) were generated. Member desktop and admin mobile screenshots were visually inspected. No claim of comprehensive accessibility certification or cross-browser testing is made.

The sandbox initially prevented `127.0.0.1:5187` binding (`listen EPERM`). Running local browser validation with execution permission resolved that. The first browser launch also found no installed Chromium; the official browser was installed with `PLAYWRIGHT_BROWSERS_PATH=/tmp/scc-browsers npx playwright install chromium`, then all journeys passed. No browser blocker remains.

## Existing Soccer Center validation limitations

These commands ran from the repository root, against unchanged production source. They do not establish a passing production baseline.

| Command | Result |
| --- | --- |
| `npm ci --ignore-scripts --cache /tmp/scc-npm-cache` | Failed: inherited manifest/lockfile mismatch; missing yjs@13.6.33, lib0@0.2.120, isomorphic.js@0.2.5. |
| `npm install --ignore-scripts --package-lock=false --no-audit --no-fund --cache /tmp/scc-npm-cache` | Passed, installed 832 packages without changing production manifests/lockfile. Dependency ranges were resolved; no locked-install guarantee. |
| `npm run type-check` | Failed with three missing-module errors: `../../../format-overrides-plugin`, `../../../export-plugins/utils/text-size`, `@airo/content`. [Log](artifacts/existing-typecheck.txt). |
| `npm run build` | Failed loading absent `content-lib/src/index.ts`, imported by `src/pages/soccer-directory.tsx`. SSR build was not reached. [Log](artifacts/existing-build.txt). |
| `npm test -- --run --exclude 'soccer-city-connect/**'` | Failed: **90 files passed / 7 failed; 732 tests passed / 10 failed**. [Log](artifacts/existing-tests.txt). |

Existing test failures: format-overrides plugin/text-size modules missing; `@/server/lib/uk-education` missing in parent/coach handlers (including three suites that cannot load and seven parent GET tests); three tryouts-db visible-total assertions receive 0 instead of expected 1/2/1. These failures were not repaired within this isolated project.

An earlier unfiltered root test attempt included prototype tests and incorrectly discovered the Playwright `.spec.ts`; the browser test was renamed `.browser.ts` to avoid introducing that discovery failure. The clean production-only count above excludes the prototype and is the reported regression-check result. The normal production build/typecheck inputs and tracked files remain unchanged.

Because the inherited build and tests fail, a complete no-regression certification or browser smoke test of the full production app is unavailable. Isolation is supported by unchanged production source/configuration, the separate launch/build entry, the narrow calendar-only production imports, and observed browser network behavior. No production service was contacted by the demo workflow.

## Handoff and remaining work

See [README.md](README.md) for startup, the guided journey, ownership/normalized field map, persistence constraints, pilot authorizations and ROI framework. The prototype is complete for fictional demonstration. Real API/auth/export availability, provider ownership, contracts, Soccer City authorization and pilot success thresholds remain unverified. Production identity enforcement, durable audit/persistence, transport/backoff and real provider integration are outside this candidate.

All savings/ROI figures are proposed measurements and formulas; none are measured business results. The next review should use the dedicated Soccer City Connect thread and the existing GitHub-to-Codespaces process only after authorization to push/handoff. The final local commit SHA is reported in the chat and available from `git log -1`.
