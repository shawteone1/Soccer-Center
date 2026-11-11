/**
 * Landing Pages — loader + route component
 *
 * Pages are listed in `landing-pages.json` (the manifest: a stable `id`, slug,
 * `componentPath`, publish date, and status). The page content is rich TSX —
 * each `.tsx` in this folder default-exports a React page component. The manifest
 * `id` (`lp-<nanoid>`) is the stable handle a marketing campaign references
 * (simple_campaign_content.contentRefId) — slugs can change, ids should not.
 *
 * Modules are imported EAGERLY (NOT lazy) so server-side renderToString resolves
 * components synchronously without hitting a Suspense boundary — mirrors the
 * eager-404 precedent in app-templates/v8/src/routes.tsx. Draft pages are reachable
 * (getPageBySlugUnfiltered); only date-phase state (scheduled/future) is handled by the component.
 */
import type { ComponentType } from 'react';
import { useParams, Navigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { setLandingPages, getPageBySlug, getPageBySlugUnfiltered, type LandingPage as LandingPageData } from '../../lib/landing-pages';
// Manifest lives at src/content/data/landingPages.json; served via virtual:content.
import { landingPages as landingPagesManifest } from 'virtual:content';

export interface PageManifestEntry {
  /** Stable id (`lp-<nanoid>`) — what a campaign references (contentRefId). */
  id: string;
  /** URL slug used for the /lp/:slug route. */
  slug: string;
  /** Path to the page component, relative to this folder (e.g. "./summer-sale.tsx"). */
  componentPath: string;
  /** Campaign start date (YYYY-MM-DD). */
  startDate?: string;
  /** Campaign end date (YYYY-MM-DD). */
  endDate?: string;
  /** Lifecycle status. */
  status?: 'published' | 'scheduled' | 'draft';
  /** Optional marketing-campaign association. */
  campaignId?: string;
}

// Normalize a path to a "./name.tsx" form so manifest entries and glob keys match.
const normalize = (p: string) => (p.startsWith('./') ? p : `./${p.replace(/^\//, '')}`);

export interface LandingPageProps {
  startDate?: string;
  endDate?: string;
}

// EAGER (SSR-safe; see routes.tsx eager-404 precedent). Each module's default export is the page component.
const pageModules = import.meta.glob<{ default: ComponentType<LandingPageProps> }>('./*.tsx', { eager: true });

const manifest = (landingPagesManifest as PageManifestEntry[]) ?? [];

// slug -> component (only manifest-listed pages are routable)
const componentLoaders: Record<string, ComponentType<LandingPageProps>> = {};
for (const entry of manifest) {
  const mod = pageModules[normalize(entry.componentPath)];
  if (mod?.default) componentLoaders[entry.slug] = mod.default;
}

setLandingPages(
  manifest.map((e): LandingPageData => ({
    id: e.id,
    slug: e.slug,
    startDate: e.startDate,
    endDate: e.endDate,
    status: e.status,
  })),
);

/**
 * The single permanent route component for /lp/:slug.
 * Draft pages are accessible (builder preview needs to navigate to them before publish).
 * Scheduled/future pages are reachable; their countdown handles pre-launch state.
 */
export default function LandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const page = slug ? (import.meta.env.VITE_PARENT_ORIGIN ? getPageBySlugUnfiltered(slug) : getPageBySlug(slug)) : null;
  const Page = slug ? componentLoaders[slug] : undefined;

  // The eager glob and module-level setLandingPages are both evaluated once when this module
  // first loads. If the agent scaffolds a new page while the server is running, the module
  // state is stale — `page` comes from the old landingPages array and `Page` comes from the
  // old glob. A hard reload re-evaluates the module, re-runs setLandingPages, and refreshes
  // the glob. Guard with sessionStorage to prevent infinite reloads for genuinely missing slugs.
  if (import.meta.env.DEV && typeof window !== 'undefined' && slug && (!page || !Page)) {
    const reloadKey = `__lp_reload:${slug}`;
    const MAX_RELOADS = 3;
    const reloadCount = parseInt(sessionStorage.getItem(reloadKey) ?? '0', 10);
    if (reloadCount < MAX_RELOADS) {
      sessionStorage.setItem(reloadKey, String(reloadCount + 1));
      window.location.reload();
      return null;
    } else {
      sessionStorage.removeItem(reloadKey);
    }
  } else if (typeof window !== 'undefined' && slug && page && Page) {
    sessionStorage.removeItem(`__lp_reload:${slug}`);
  }

  if (!page || !Page) {
    if (typeof window !== 'undefined') console.warn(`[landing-page] no page found for slug "${slug}" — redirecting home`);
    return <Navigate to="/" replace />;
  }
  return (
    <>
      <Helmet>
        <title>Soccer Center</title>
        <meta name="description" content="Soccer Center landing page." />
      </Helmet>
      <h1 className="sr-only">Soccer Center</h1>
      <Page startDate={page.startDate} endDate={page.endDate} />
    </>
  );
}
