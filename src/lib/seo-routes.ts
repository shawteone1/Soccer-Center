/**
 * Auto-synced registry of publicly-crawlable routes. Consumed by the
 * /sitemap.xml handler in src/server/entry.ts.
 *
 * DO NOT add or remove paths by hand. Static paths are mirrored here from
 * src/routes.tsx automatically whenever that file is edited (any manual
 * path edit would be overwritten on the next routes.tsx change). For sync
 * to pick up a route, its `path` must be a literal string starting with "/";
 * template literals and identifier refs are skipped, and dynamic-param routes
 * like "/products/:id" are excluded. The legal pages "/privacy" and "/terms"
 * are never listed here.
 *
 * The only fields safe to hand-edit are the per-entry metadata below, after a
 * sync:
 * - `priority` (0.0–1.0): Home = 1.0, main sections = 0.8, deep pages = 0.5.
 * - `changefreq` and `lastmod`.
 */

export interface SeoRoute {
  path: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
  lastmod?: string;
}

export const seoRoutes: SeoRoute[] = [
  { path: "/", changefreq: "weekly", priority: 1.0 },
  { path: "/camps", changefreq: "monthly", priority: 0.8 },
  { path: "/soccer-directory", changefreq: "weekly", priority: 0.9 },
  { path: "/resources", changefreq: "monthly", priority: 0.8 },
  { path: "/community", changefreq: "monthly", priority: 0.8 },
  { path: "/fanzone", changefreq: "weekly", priority: 0.8 },
  { path: "/fanzone/highlights", changefreq: "daily", priority: 0.8 },
  { path: "/pro-sources-coverage", changefreq: "weekly", priority: 0.7 },
  { path: "/teams", changefreq: "monthly", priority: 0.9 },
  { path: "/tryouts", changefreq: "weekly", priority: 0.9 },
  { path: "/my-soccer", changefreq: "monthly", priority: 0.8 },
  { path: "/parent-portal", changefreq: "monthly", priority: 0.8 },
  { path: "/parent-portal/players/new", changefreq: "monthly", priority: 0.5 },
  { path: "/parent-portal/pilot", changefreq: "monthly", priority: 0.5 },
  { path: "/parent-portal/locked-in-demo", changefreq: "monthly", priority: 0.5 },
  { path: "/demo/parent-portal", changefreq: "monthly", priority: 0.5 },
  { path: "/admin/content", changefreq: "monthly", priority: 0.5 },
  { path: "/admin/settings", changefreq: "monthly", priority: 0.5 },
  { path: "/lp/youth-tryouts-fall-2026", changefreq: "monthly", priority: 0.7 },
  { path: "/blog", changefreq: "weekly", priority: 0.8 },
  { path: "/login", changefreq: "monthly", priority: 0.8 },
  { path: "/login/auth", changefreq: "monthly", priority: 0.5 },
  { path: "/scores", changefreq: "monthly", priority: 0.8 },
];
