import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { Link } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';

function useCountdown(targetDate: string) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(targetDate));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(getTimeLeft(targetDate));
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return timeLeft;
}

function parseDateMs(raw: string): number | null {
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

function getTimeLeft(targetDate: string) {
  if (!targetDate) return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true };
  const end = parseDateMs(targetDate);
  if (end === null) return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true };
  const now = Date.now();
  const diff = end - now;

  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true };

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    ended: false,
  };
}

export default function YouthTryoutsFall2026Page({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const [searchParams] = useSearchParams();
  const saleStart = startDate ? `${startDate}T00:00:00Z` : '';
  const saleEnd = endDate ? `${endDate}T23:59:59Z` : '';
  const effectiveSaleStart = (import.meta.env.VITE_PARENT_ORIGIN ? searchParams.get('__preview_start') : null) ?? saleStart;
  const effectiveSaleEnd = (import.meta.env.VITE_PARENT_ORIGIN ? searchParams.get('__preview_end') : null) ?? saleEnd;
  const now = Date.now();
  const startMs = effectiveSaleStart ? parseDateMs(effectiveSaleStart) : null;
  const endMs = effectiveSaleEnd ? parseDateMs(effectiveSaleEnd) : null;
  const hasStarted = startMs !== null ? now >= startMs : true;
  const hasEnded = endMs !== null ? now >= endMs : false;
  const saleCountdown = useCountdown(effectiveSaleEnd);
  const startCountdown = useCountdown(effectiveSaleStart);

  // SALE ENDED
  if (hasEnded) {
    return (
      <section className="min-h-screen flex items-center justify-center bg-background">
        <Helmet>
          <title>Youth Tryouts Fall/Winter 2026 — Soccer Center</title>
          <meta name="description" content="Find youth soccer tryouts across Colorado for fall and winter 2026. Soccer Center connects players and families with local clubs." />
        </Helmet>
        <div className="text-center px-6 py-20 max-w-lg mx-auto">
          <div className="text-5xl mb-6">⚽</div>
          <h1 className="text-4xl font-bold text-foreground mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
            Tryout Season Has Wrapped
          </h1>
          <p className="text-muted-foreground text-lg mb-8">
            The fall/winter 2026 tryout window has closed — but new listings are always coming. Head back to Soccer Center to find upcoming opportunities near you.
          </p>
          <Link
            to="/tryouts"
            className="inline-block px-8 py-4 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'hsl(var(--primary))' }}
          >
            Browse All Tryouts
          </Link>
        </div>
      </section>
    );
  }

  // COMING SOON
  if (!hasStarted) {
    return (
      <section className="min-h-screen flex items-center justify-center bg-background">
        <Helmet>
          <title>Youth Tryouts Fall/Winter 2026 — Coming Soon | Soccer Center</title>
          <meta name="description" content="Fall/winter youth soccer tryouts are coming to Soccer Center. Find clubs and teams across Colorado — listings drop October 13." />
        </Helmet>
        <div className="text-center px-6 py-20 max-w-xl mx-auto">
          <span
            className="text-xs font-semibold tracking-widest uppercase mb-4 block"
            style={{ color: 'hsl(var(--primary))' }}
          >
            Soccer Center
          </span>
          <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
            Tryout Season Is Almost Here
          </h1>
          <p className="text-muted-foreground text-lg mb-8">
            Fall/winter youth soccer tryout listings drop October 13. Be ready to find your team.
          </p>
          <div className="flex justify-center gap-6 mb-10">
            {[
              { value: startCountdown.days, label: 'Days' },
              { value: startCountdown.hours, label: 'Hours' },
              { value: startCountdown.minutes, label: 'Min' },
              { value: startCountdown.seconds, label: 'Sec' },
            ].map(({ value, label }) => (
              <div key={label} className="flex flex-col items-center">
                <span
                  className="font-mono text-4xl font-bold text-foreground w-16 h-16 flex items-center justify-center rounded-lg"
                  style={{ background: 'hsl(var(--card))' }}
                >
                  {String(value).padStart(2, '0')}
                </span>
                <p className="text-xs text-muted-foreground mt-2 uppercase tracking-widest">{label}</p>
              </div>
            ))}
          </div>
          <Link
            to="/tryouts"
            className="inline-block px-8 py-4 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'hsl(var(--primary))' }}
          >
            Preview Tryout Listings
          </Link>
        </div>
      </section>
    );
  }

  // ACTIVE SALE — show countdown to end + campaign content
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Find Your Team — Youth Tryouts Fall/Winter 2026 | Soccer Center</title>
        <meta name="description" content="Colorado youth soccer tryouts for fall and winter 2026. Browse clubs by region, find open tryouts near you, and get your player on a team." />
        <link rel="canonical" href="https://soccercenter.org/lp/youth-tryouts-fall-2026" />
      </Helmet>

      {/* URGENCY BANNER */}
      <div className="py-3 text-center text-sm font-semibold tracking-wide text-white" style={{ background: 'hsl(var(--primary))' }}>
        Tryout window closes in{' '}
        <span className="font-mono">
          {saleCountdown.days}d {saleCountdown.hours}h {saleCountdown.minutes}m {saleCountdown.seconds}s
        </span>
        {' '}— don&apos;t miss your spot
      </div>

      {/* HERO */}
      <section className="relative overflow-hidden" style={{ minHeight: '520px' }}>
        <img
          src="/airo-assets/images/pages/lp/youth-tryouts-hero"
          alt="Youth soccer players training on a sunny field"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80 pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 py-24 max-w-4xl mx-auto">
          <span
            className="text-xs font-semibold tracking-widest uppercase mb-4 block"
            style={{ color: 'hsl(var(--primary))' }}
          >
            Soccer Center · Fall/Winter 2026
          </span>
          <h1
            className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Find Your Team.<br />Find the Game.
          </h1>
          <p className="text-white/80 text-xl mb-10 max-w-2xl">
            Colorado youth soccer tryouts — all regions, all ages — in one place. Browse open listings and get your player on a team this fall.
          </p>
          <Link
            to="/tryouts"
            className="inline-block px-10 py-5 rounded-lg font-bold text-lg text-white transition-opacity hover:opacity-90 shadow-lg"
            style={{ background: 'hsl(var(--primary))' }}
          >
            Find Tryouts Near You &rarr;
          </Link>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-xxl bg-card">
        <div className="max-w-5xl mx-auto px-6">
          <h2
            className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            How Soccer Center Works
          </h2>
          <p className="text-muted-foreground text-center mb-14 max-w-xl mx-auto">
            We do the legwork so families can focus on the game.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {([
              {
                step: '01',
                title: 'Pick Your Region',
                body: 'Choose from 7 Colorado regions — Front Range, Denver Metro, Boulder, Colorado Springs, and more.',
              },
              {
                step: '02',
                title: 'Browse Open Tryouts',
                body: 'See upcoming tryout dates, age groups, and club details — all in one clean list, updated regularly.',
              },
              {
                step: '03',
                title: 'Connect with a Club',
                body: "Click through to the club's official site to register, get directions, and secure your player's spot.",
              },
            ] as { step: string; title: string; body: string }[]).map(({ step, title, body }) => (
              <div
                key={step}
                className="rounded-xl p-8 border"
                style={{ background: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
              >
                <span
                  className="text-4xl font-bold block mb-4"
                  style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--primary))' }}
                >
                  {step}
                </span>
                <h3 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
                  {title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REGIONS */}
      <section className="py-xxl bg-background">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2
            className="text-3xl md:text-4xl font-bold text-foreground mb-4"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Tryouts Across Colorado
          </h2>
          <p className="text-muted-foreground mb-12 max-w-xl mx-auto">
            From the Front Range to the Western Slope — we cover all 7 regions.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            {(['Front Range', 'Denver Metro', 'Boulder / Longmont', 'Colorado Springs', 'Fort Collins / Greeley', 'Western Slope', 'Southern Colorado'] as string[]).map((region) => (
              <span
                key={region}
                className="px-4 py-2 rounded-full text-sm font-medium border"
                style={{ borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))', background: 'hsl(var(--card))' }}
              >
                {region}
              </span>
            ))}
          </div>
          <Link
            to="/tryouts"
            className="inline-block px-10 py-5 rounded-lg font-bold text-lg text-white transition-opacity hover:opacity-90"
            style={{ background: 'hsl(var(--primary))' }}
          >
            Browse All Tryout Listings &rarr;
          </Link>
        </div>
      </section>

      {/* FOOTER CTA */}
      <section className="py-xl bg-card border-t" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p
            className="text-2xl md:text-3xl font-bold text-foreground mb-2"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Your home for soccer.
          </p>
          <p className="text-muted-foreground mb-8">
            Connecting players, families, and communities across Colorado.
          </p>
          <Link
            to="/"
            className="text-sm font-medium hover:underline"
            style={{ color: 'hsl(var(--primary))' }}
          >
            Learn more about Soccer Center &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}
