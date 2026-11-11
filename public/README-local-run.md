# Soccer Center — Local Synthetic-Only Run

This document describes how to run the application locally in two modes:
1. **Isolated demo** — frontend-only, no backend, no secrets, no database
2. **Full application** — requires live secrets and a MySQL database

---

## Prerequisites

- Node.js 20+
- npm 10+

## Extract and install

```bash
unzip soccer-center-b8e1966.zip
cd soccer-center-b8e1966
npm ci
```

`npm ci` installs all dependencies including `@playwright/test` (now in devDependencies).
After `npm ci`, install the Chromium browser binary:

```bash
npx playwright install chromium
```

---

## Mode 1: Isolated demo (no secrets, no database)

Runs the coach profile sharing workflow at `/demo/parent-portal` and
`/coach/profile/:token` using only synthetic fixtures and demo localStorage.

### What is isolated

- **Entry point:** `demo.html` → `src/demo-main.tsx` — NOT `index.html` → `src/main.tsx`.
  `src/main.tsx` imports `App.tsx` which imports authentication session logic.
  `src/demo-main.tsx` imports only the two demo pages and their providers
  (React Router, TanStack Query, HelmetProvider). No auth, no analytics, no
  backend entry.
- **Dev routing:** `demoHtmlRewritePlugin` in `vite.demo.ts` intercepts all
  requests to `/`, `/demo/parent-portal`, and `/coach/profile/:token` and
  serves `demo.html` (transformed through Vite's HTML pipeline). This ensures
  `src/demo-main.tsx` is loaded — not `src/main.tsx` — for every demo route,
  including direct navigation and reload.
- `server/entry.ts` is **never imported** — no migrations, no auth setup,
  no database connections are attempted.
- All `/api/*` requests are intercepted and rejected with 503 so
  `CoachShareTab` falls through to its built-in `isDemoMode=true` path.
- `#airo/secrets` resolves to `src/lib/demo/secrets-adapter.ts` — a
  no-op adapter that returns `undefined` for every key.
- No live secrets or database credentials are required.

### Start the isolated demo

```bash
npm run demo:coach
# Server: http://localhost:5174  (strictPort: true — fails if port is taken)
```

### Verify entry routing (no browser needed)

```bash
# Each route must return HTML containing src/demo-main.tsx, not src/main.tsx
curl -s http://localhost:5174/ | grep -o 'src/demo-main\|src/main'
# → src/demo-main

curl -s http://localhost:5174/demo/parent-portal | grep -o 'src/demo-main\|src/main'
# → src/demo-main

curl -s http://localhost:5174/coach/profile/demo-token-abc | grep -o 'src/demo-main\|src/main'
# → src/demo-main
```

### Build the isolated demo (SPA, no SSR)

```bash
npm run demo:build
# Output: dist/demo/
# Verify: grep -o 'assets/demo-[^"]*' dist/demo/demo.html
# → assets/demo-<hash>.js  (bundled from src/demo-main.tsx, not src/main.tsx)
```

### Demo URLs

| URL | Description |
|-----|-------------|
| `http://localhost:5174/demo/parent-portal` | Parent demo — select a U16+ player, open Recruiting tab |
| `http://localhost:5174/coach/profile/<demo-token>` | Coach card — opened automatically via "View card" button |

### Demo walkthrough

1. Open `http://localhost:5174/demo/parent-portal`
2. Select **Colorado Rush** → **ECNL** → **U16** → **Colorado Rush ECNL U16** → **Avery Barker**
3. Click the **Recruiting** button (not a tab — it's a `<button>`)
4. In the **Coach Profile Sharing** section, check fields and click **Next: Match records**
5. Select match records and click **Next: Link settings**
6. Accept defaults and click **Preview card**
7. Verify the coach card preview, then click **Create link**
8. Click **View card** — the coach card opens in a new tab
9. In the parent tab, expand **Active links** and click **Revoke**
10. Reload the coach tab — the neutral "unavailable" state is shown

---

## Mode 2: Synthetic-only commands (type-check + tests, no server)

### Type-check
```bash
npm run type-check
# Expected: 17 pre-existing errors in pilot/match-record/BlogPostPage files.
# Zero errors in changed files.
```

### Unit and handler tests (no database required)
```bash
npx vitest run \
  "src/server/api/parent/players/[playerId]/coach-links/step3.test.ts" \
  "src/server/api/parent/players/[playerId]/coach-links/step4.test.ts" \
  "src/server/api/parent/players/[playerId]/coach-links/step5-browser.test.ts" \
  "src/server/api/parent/players/[playerId]/coach-preview/handler.test.ts" \
  "src/server/api/parent/players/[playerId]/coach-preview/projection.test.ts" \
  "src/server/lib/player-stats-aggregation.test.ts"
# Expected: 164/164 pass
```

---

## Playwright end-to-end test (browser required)

The Playwright test at `e2e/coach-share-demo.spec.ts` covers the full
two-tab workflow against the isolated demo server (10 test cases).

**EXECUTION STATUS: INCOMPLETE** — the build environment blocks all port
binding (`EACCES: permission denied` on every port). The demo server cannot
start, so Playwright cannot connect. The test file is runnable locally.

### Run the Playwright test

```bash
# Install Playwright (one-time, already in devDependencies after npm ci)
npx playwright install chromium

# Run the test (starts demo:coach automatically via playwright.config.ts webServer)
npx playwright test e2e/coach-share-demo.spec.ts
# or
npm run demo:test

# Screenshots saved to e2e/screenshots/
# HTML report: e2e/playwright-report/
```

### What the Playwright test covers

| Test | Description |
|------|-------------|
| T1 | Selector cascade → Recruiting button → CoachShareTab renders |
| T2 | Full wizard: fields → matches → settings → preview → create link |
| T3 | Approved fields appear; unapproved fields absent |
| T4 | Changed field selections update preview |
| T5 | Zero matches + stats field → stats unavailable |
| T6 | Partial coverage: demo-mr-1 (goals=2) + demo-mr-6 (goals=null) → "1 of 2" annotation |
| T7 | Create link → View card → ALL approved content matches preview; unapproved absent |
| T8 | Revoke → reload coach tab → `data-testid="coach-card-unavailable"` state |
| T9 | `Storage.prototype.setItem` override → error shown, link stays active; restore → revoke succeeds |
| T10 | Context-level API monitoring: zero `/api/*` requests across all tabs |

### Key assertion improvements over prior version

- **T7:** Compares all approved fields (label, ageBand, graduationYear, primaryPosition,
  clubName, achievements, affiliations) between preview and coach card. Explicitly asserts
  unapproved fields (secondaryPosition, foot, profileIntroduction) are absent.
- **T8:** Uses `data-testid="coach-card-unavailable"` (unique container) and asserts
  both that the unavailable state is visible AND that the coach card is absent.
- **T9:** Overrides `Storage.prototype.setItem` (not `localStorage.setItem`) and stores
  the original on `window` (not inside `localStorage`, which only stores strings).
- **T10:** API monitoring registered at context level before any page is created,
  so initial requests from new tabs cannot be missed.

---

## #airo/secrets — platform-managed module

`package.json` maps `#airo/secrets` to `./airo-secrets/src/index.ts`.
This path is platform-managed and cannot be written in this environment.

**For the isolated demo:** `vite.demo.ts` aliases `#airo/secrets` to
`src/lib/demo/secrets-adapter.ts` — a no-op adapter that returns
`undefined` for every key. The demo build never imports the platform module.

**For local full-application development:** create `airo-secrets/src/index.ts`:

```typescript
export function getSecret(name: string): string | undefined {
  return process.env[name];
}
```

---

## Pre-existing type errors (not caused by this work)

17 errors in:
- `src/pages/blog/[slug].tsx` (BlogPostPage coverImage)
- `src/components/portal/PilotBanner.tsx` (pilot statVal)
- `src/server/api/parent/players/[playerId]/match-records/` (ResultSetHeader casts)

---

## What requires live secrets / database

- Authentication (BetterAuth, Google OAuth)
- Parent portal player data, match records, recruiting
- SC Fax scores (football-data.org API key)
- Fan Arena YouTube feeds (YouTube API key)
- Contact form (Inbox widget)
- iCal feed sync
