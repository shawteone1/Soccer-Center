# Soccer City Operations Desk — powered by PlayRcmd

Historical Operations Desk handoff. See [PILOT_HARDENING_REPORT.md](PILOT_HARDENING_REPORT.md) for the November 20 continuation, current test counts, onboarding/connection features and backend activation dependencies.

November 19, 2026 · continuation of the original Soccer City Connect build.

## Recovery and scope

Recovered and verified original commit `c478169dad5aebdd1dcf3ffd0497189d24283887` on `codex/soccer-city-connect-poc` in `/workspace/soccer-city-connect`. The checkout was clean and no applicable AGENTS.md was present. This is an incremental change to that implementation, not a replacement or duplicate application.

The member portal remains Soccer City Connect, powered by Soccer Center. All three adapters, their fictional source fixtures and the original eight functional tests are unchanged. The original four browser journeys are retained, with only the expected administrator heading updated for the new name. No production routes, databases, credentials, deployment configuration or Arena Pathway files were changed.

## Accessible preview

**[Download/open the interactive Operations Desk preview](artifacts/operations-desk-preview.html).** Save the HTML file and open it in Chrome or another modern browser. It includes the compiled app, styles and icons, starts in the administrator view and needs no web server or network connection. Member switching, staff assignment, follow-up notes, local resolution, history and reset work in the same preview. Chromium testing verified that it loads and completes the workflow from `file://` without any HTTP requests.

Browser file-storage behavior can vary. If the browser denies persistence, the app displays a warning; use the localhost launch for reliable same-origin tab testing. The downloaded copy and localhost app use separate browser storage. Do not enter real member data.

No cloud preview-forwarding or desktop interaction tool was exposed in this resumed environment. Tool discovery and the connected document-session check found no usable forwarding/viewer session. The downloadable artifact is the accessible preview delivered here; no hosted or public deployment is implied.

For the existing local preview:

```bash
cd /workspace/soccer-city-connect/soccer-city-connect
npm run dev
```

Open `http://127.0.0.1:5187/#admin`; member view is `/#member`. The original parent dependencies are already installed in this workspace. See the original README for setup if needed elsewhere. A private port forward can be used from a client that supports it.

To regenerate the standalone preview after source changes:

```bash
npm run preview:export
```

The browser-test command automatically builds/exports the preview before testing it. The export is a local artifact, not publishing or deployment.

## Staff walkthrough

1. Select **Reset demo**. Administrator now opens **Soccer City Operations Desk — powered by PlayRcmd**. The member portal retains its original branding and experience.
2. **Daily operations** starts at the fictional operating date November 14, 2026. Review the league session, participant commitment and source reference. Choose November 15 for pickup or November 21 for camp. Due/overdue counts follow the selected date; global open/assignment counts cover all demo tasks.
3. In **Exception queue**, select a simulated acting staff member. This is not verified authentication. Two local tasks reference existing provider records: the missing participation waiver and the unconfirmed identity review.
4. Assign the waiver to Casey Brooks, set a follow-up date and save a fictional staff note. Assignment/date changes and saved notes record the acting staff name, source key and timestamp in the original audit history. No email, text or provider message is sent.
5. Filter by queue owner or local status. **Inspect source** shows the original source identifier/status. Closing the viewer changes nothing.
6. **Resolve local workflow (simulated)** completes the waiver review. Provider status remains **Missing**, and eligibility still needs provider confirmation. Completing the identity review never changes its null identity association or merges people.
7. Review **Resolution history**: assignee, actual simulated completer from the audit, time and latest note. The full activity history remains available below the original provider synchronization controls.
8. Switch to Member portal or a second same-origin tab and refresh. The waiver's local resolution is visible while the provider status remains Missing. Staff follow-up notes remain in the staff workflow, not the member UI.
9. Simulated provider sync, failure/retry and refresh preserve assignment, notes, follow-up dates and completion. Reset clears these demo fields and the original demo state only.
10. **Operational measurement** reports observed demo counts and elapsed handling intervals, with no claim of Soccer City performance or ROI. Use the navigation links to jump to member lookup and the preserved consolidated calendar.

## State and ownership

The existing browser storage key/version remain `sc_city_connect_demo_v1` / version 1. Loading an original c478169 snapshot adds missing local tasks without replacing records, resolutions or audit. Existing local task values take precedence over seeded defaults. The first subsequent action persists the upgraded snapshot; no migration touches provider data.

New local fields: task source key/title/priority, assigned staff ID, follow-up date, created/updated time and append-only saved notes with author/time/text. Existing `resolutions` remains the local completion indicator shared with the member portal. Notes are limited to 1,500 characters; blank/invalid actions do not create audit entries. Unknown staff IDs and invalid dates are rejected.

Assignments and completion are different actions: history distinguishes the assignee from the simulated staff member who completed the review. Legacy completion without timing evidence is preserved and is excluded from interval measurement. Source records remain unchanged by every staff operation; simulated imports retain their original read-only behavior.

This remains browser-local demonstration state, not a production staff access system or durable audit store. Same-origin sequential tabs are supported; concurrent writes have no arbitration. Staff identity is selected for demonstration, not authenticated. Provider-approved access, transport, identity verification, retention, server authorization and durable storage remain live-pilot prerequisites from the original brief.

## Measurement definitions

- Open exceptions: seeded local tasks without an existing local resolution.
- Unassigned open: open tasks without a staff assignment.
- Due/overdue open: open tasks with follow-up equal to/before the selected operating date.
- Sessions: source events whose America/Denver date matches the operating date.
- Local reviews completed and notes saved: observed demo totals since reset.
- Handling interval: first observed assignment or note to recorded local completion, for valid nonnegative intervals only. Mean includes waiting time; it is not active labor time. Untimed legacy/one-click completions are excluded; no sample shows “Not measured.”

No labor savings, cash savings or pilot ROI were measured. Before a real pilot, measure actual task volumes, active staff time, systems opened, re-entry, exception backlog and member inquiries. Compare like tasks and include implementation/training, licensing, integration, maintenance and exception-handling costs. Separate capacity released from evidenced cash savings.

## Validation

Commands ran from `/workspace/soccer-city-connect/soccer-city-connect`:

| Command | Actual result |
| --- | --- |
| `npm run type-check` | Passed, exit 0. [Log](artifacts/operations-typecheck.txt) |
| `npm test` | Passed, 13 tests in 2 files: all original 8 plus 5 operations tests. [Log](artifacts/operations-functional-tests.txt) |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/scc-browsers npm run test:browser` | Passed, 8 Chromium journeys, 10.4 seconds; also built/exported the preview successfully. [Log](artifacts/operations-browser-tests.txt) |

New functional tests cover assignment/author attribution, note validation, follow-up/overdue logic, source immutability, local completion and idempotency, measured intervals, sync/failure/retry preservation, original snapshot migration, identity separation and reset.

New browser tests cover the complete staff workflow, filtering, source inspection, refresh and two-tab member consistency, history and measurements, sync/retry preservation, daily schedule, mobile layout and lookup navigation, legacy state recovery and the actual downloadable preview. The original member/calendar/sync/reset journeys still pass. Network observations show no external-provider or production `/api/` requests.

The first added browser run exposed ambiguous queue-filter labels; explicit accessible names corrected that, and all eight journeys passed on the final run. Desktop and mobile Operations Desk screenshots were generated and visually inspected. This is Chromium/keyboard/responsive verification, not accessibility certification or all-browser coverage.

- [Completed staff workflow, desktop](artifacts/operations-workflow-desktop.png)
- [Operations Desk, mobile](artifacts/operations-desk-mobile.png)
- [Preserved member portal, desktop](artifacts/member-desktop.png)

The repository-root `npm run type-check` was also attempted: it still fails on the same three inherited missing modules (`format-overrides-plugin`, `export-plugins/utils/text-size`, `@airo/content`). The complete production build/test suite was not rerun because production source/configuration is unchanged; the earlier documented failures in [VALIDATION.md](VALIDATION.md) remain unresolved. No production regression certification is claimed.

## Handoff boundary

Commit locally on `codex/soccer-city-connect-poc`; the final SHA is reported in the conversation and `git log -1`. No push, merge, production deployment or publishing is performed. Continue design/testing/pilot decisions in the dedicated Soccer City Connect thread.
