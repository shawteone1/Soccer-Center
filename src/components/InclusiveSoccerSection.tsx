/**
 * InclusiveSoccerSection
 * Renders the Inclusive Soccer subsection on the Community page.
 * Three filterable categories: Unified, Power Wheelchair, Blind & VI.
 * Listings are filtered by the active region slug passed from the parent.
 */
import { useState } from 'react';
import { ExternalLink, Mail, Phone, MapPin, Globe } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InclusiveListing {
  id: string;
  regionSlug: string;
  name: string;
  category: string;
  serviceArea: string;
  description: string;
  website: string;
  email: string | null;
  phone: string | null;
  eligibility: string | null;
  listingType: string;
  availability: string;
  officialSourceUrl: string;
  lastCheckedAt: string | null;
  lastVerifiedAt: string | null;
  adminNote: string | null;
  adminStatus: string;
}

export interface CategoryMeta {
  label: string;
  description: string;
}

export interface InclusiveSoccerData {
  sectionTitle: string;
  sectionDescription: string;
  categories: Record<string, CategoryMeta>;
  listings: InclusiveListing[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_ORDER = ['unified', 'power', 'blind'] as const;

const CATEGORY_COLORS: Record<string, string> = {
  unified: 'hsl(var(--primary))',
  power:   'hsl(var(--secondary))',
  blind:   'hsl(var(--accent))',
};

const LISTING_TYPE_LABELS: Record<string, string> = {
  local_program:     'Local program',
  regional_referral: 'Regional referral',
  national_referral: 'National resource',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function InclusiveCard({ listing, categoryLabel }: { listing: InclusiveListing; categoryLabel: string }) {
  const isNational = listing.listingType === 'national_referral';
  const accentColor = CATEGORY_COLORS[listing.category] ?? 'hsl(var(--primary))';
  const typeLabel = LISTING_TYPE_LABELS[listing.listingType] ?? listing.listingType;
  const buttonLabel = isNational ? 'Find local opportunities' : 'Visit program';

  return (
    <article
      className="rounded-2xl border flex flex-col transition-shadow hover:shadow-lg"
      style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
    >
      <div className="p-6 flex flex-col flex-1">
        {/* Category + type badges */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: `${accentColor}22`, color: accentColor }}
          >
            {categoryLabel}
          </span>
          <span
            className="text-xs font-medium px-2.5 py-1 rounded-full"
            style={{
              background: 'hsl(var(--muted))',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            {typeLabel}
          </span>
        </div>

        {/* Name */}
        <h3
          className="text-xl font-bold text-foreground mb-2 leading-snug"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {listing.name}
        </h3>

        {/* Service area */}
        <div className="flex items-center gap-1.5 mb-3">
          <MapPin size={13} style={{ color: 'hsl(var(--muted-foreground))' }} aria-hidden="true" />
          <span className="text-xs text-muted-foreground">{listing.serviceArea}</span>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-5">
          {listing.description}
        </p>

        {/* Contact info */}
        {(listing.email || listing.phone) && (
          <div className="flex flex-col gap-1.5 mb-4">
            {listing.email && (
              <a
                href={`mailto:${listing.email}`}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail size={12} aria-hidden="true" />
                {listing.email}
              </a>
            )}
            {listing.phone && (
              <a
                href={`tel:${listing.phone.replace(/[^+\d]/g, '')}`}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Phone size={12} aria-hidden="true" />
                {listing.phone}
              </a>
            )}
          </div>
        )}

        {/* CTA */}
        <a
          href={listing.website}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${buttonLabel} — ${listing.name} (opens in a new tab)`}
          className="inline-flex items-center gap-1.5 self-start text-sm font-bold rounded-lg px-4 py-2.5 transition hover:opacity-85"
          style={{
            background: accentColor,
            color: 'hsl(var(--primary-foreground))',
          }}
        >
          {isNational ? <Globe size={13} /> : <ExternalLink size={13} />}
          {buttonLabel}
        </a>
      </div>
    </article>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface InclusiveSoccerSectionProps {
  data: InclusiveSoccerData;
  regionSlug: string;
}

export default function InclusiveSoccerSection({ data, regionSlug }: InclusiveSoccerSectionProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Only published listings for this region
  const regionListings = data.listings.filter(
    (l) => l.regionSlug === regionSlug && l.adminStatus === 'ok'
  );

  if (regionListings.length === 0) return null;

  const displayedListings = activeCategory
    ? regionListings.filter((l) => l.category === activeCategory)
    : regionListings;

  // Count per category for badge
  const countByCategory = CATEGORY_ORDER.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = regionListings.filter((l) => l.category === cat).length;
    return acc;
  }, {});

  // Local vs referral summary
  const localCount = regionListings.filter((l) => l.listingType === 'local_program').length;
  const referralCount = regionListings.filter((l) => l.listingType !== 'local_program').length;

  return (
    <section
      id="inclusive-soccer"
      aria-labelledby="heading-inclusive-soccer"
      style={{ scrollMarginTop: '160px', borderColor: 'hsl(var(--border))' }}
      className="mt-16 pt-12 border-t"
    >
      {/* Section header */}
      <div className="flex items-start gap-4 mb-8">
        <div
          className="w-1 rounded-full self-stretch shrink-0 mt-1"
          style={{ background: 'hsl(var(--primary))' }}
          aria-hidden="true"
        />
        <div>
          <h2
            id="heading-inclusive-soccer"
            className="text-3xl md:text-4xl font-bold text-foreground leading-tight"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {data.sectionTitle}
          </h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
            {data.sectionDescription}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {localCount} local program{localCount !== 1 ? 's' : ''} · {referralCount} referral resource{referralCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Category filter pills */}
      <nav aria-label="Filter inclusive soccer by category" className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setActiveCategory(null)}
          className="rounded-full px-4 py-2 text-sm font-bold transition-all"
          style={
            activeCategory === null
              ? { background: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }
              : { background: 'hsl(var(--card))', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' }
          }
          aria-pressed={activeCategory === null}
        >
          All ({regionListings.length})
        </button>
        {CATEGORY_ORDER.map((cat) => {
          const meta = data.categories[cat];
          if (!meta || countByCategory[cat] === 0) return null;
          const color = CATEGORY_COLORS[cat];
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(isActive ? null : cat)}
              aria-pressed={isActive}
              title={meta.description}
              className="rounded-full px-4 py-2 text-sm font-bold transition-all"
              style={
                isActive
                  ? { background: color, color: 'hsl(var(--primary-foreground))' }
                  : { background: 'hsl(var(--card))', color: color, border: `1px solid ${color}` }
              }
            >
              {meta.label} ({countByCategory[cat]})
            </button>
          );
        })}
      </nav>

      {/* Category description when filtered */}
      {activeCategory && data.categories[activeCategory] && (
        <p className="text-sm text-muted-foreground mb-6 italic">
          {data.categories[activeCategory].description}
        </p>
      )}

      {/* Listings grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {displayedListings.map((listing) => (
          <InclusiveCard
            key={listing.id}
            listing={listing}
            categoryLabel={data.categories[listing.category]?.label ?? listing.category}
          />
        ))}
      </div>

      {/* National referral note */}
      {displayedListings.some((l) => l.listingType === 'national_referral') && (
        <p className="mt-6 text-xs text-muted-foreground">
          Cards labelled "National resource" link to national directories — not local venues. Use them to ask about programs in your area.
        </p>
      )}
    </section>
  );
}
