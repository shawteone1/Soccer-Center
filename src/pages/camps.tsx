import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useSearchParams } from 'react-router';
import PublicCampDirectory from '@/components/PublicCampDirectory';

export default function CampsPage() {
  const [params] = useSearchParams();
  const fromParent = params.get('from') === 'parent';
  const title = 'Soccer Camps | Soccer Center';
  const description = 'Find Colorado club soccer camps and college camp resources across the region. Browse by type, region, and program.';
  const url = 'https://soccercenter.org/camps';

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>
      <main>
        <div className="bg-background pt-24 pb-4 px-6">
          <div className="mx-auto max-w-6xl">
            {fromParent && <Link to="/parent-portal" className="inline-flex items-center min-h-11 rounded-lg border border-border px-4 py-2 mb-5 font-semibold text-foreground">← Back to Parent Portal</Link>}
            <h1 className="text-4xl font-bold text-foreground">Soccer Camps</h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Colorado club camps and college camp resources across our regions. Confirm dates, ages, costs and availability directly with the organizer before registering.
            </p>
          </div>
        </div>
        <PublicCampDirectory />
      </main>
    </>
  );
}
