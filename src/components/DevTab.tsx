/**
 * DevTab — Development tab for My Soccer dashboard.
 * 4 category buttons: Defending · Attacking · Midfield · Goalkeeping
 * Fetches curated videos by category from /api/my-soccer/content?category=
 * One active player at a time (activeId / onPlay / onStop pattern).
 */
import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import DevContentCard, { type ContentItem } from '@/components/DevContentCard';

type Category = 'defending' | 'attacking' | 'midfield' | 'goalkeeping' | 'fitness';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'defending',   label: 'Defending'           },
  { id: 'attacking',   label: 'Attacking'           },
  { id: 'midfield',    label: 'Midfield'            },
  { id: 'goalkeeping', label: 'Goalkeeping'         },
  { id: 'fitness',     label: 'Fitness & speed'     },
];

interface DevTabProps {
  onSave: (contentId: string) => Promise<void>;
  onUnsave: (contentId: string) => Promise<void>;
}

export default function DevTab({ onSave, onUnsave }: DevTabProps) {
  const [activeCategory, setActiveCategory] = useState<Category>('defending');
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savedIds] = useState<Set<string>>(new Set());

  const fetchCategory = useCallback(async (cat: Category) => {
    setLoading(true);
    setActiveId(null);
    try {
      const res = await fetch(`/api/my-soccer/content?category=${cat}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as { items: ContentItem[] };
        setItems(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCategory(activeCategory);
  }, [activeCategory, fetchCategory]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
          Development
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Player instruction videos — technique, tactics, and position-specific training
        </p>
      </div>

      {/* Category buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeCategory === cat.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Content grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground text-sm">No videos available for this category yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <DevContentCard
              key={item.contentId}
              item={item}
              savedIds={savedIds}
              onSave={onSave}
              onUnsave={onUnsave}
              activeId={activeId}
              onPlay={(id) => setActiveId(id)}
              onStop={() => setActiveId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
