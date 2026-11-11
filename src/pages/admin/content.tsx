/**
 * /admin/content — Admin content management page.
 * Requires isAdmin. Shows all sc_dev_content rows with status badges,
 * approve/unpublish/archive controls, and review notes.
 */
import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useNavigate } from 'react-router';
import { useSession } from '@/lib/auth/auth-client';
import {
  CheckCircle, XCircle, Archive, AlertTriangle, RefreshCw,
  ExternalLink, ChevronDown, ChevronUp, Upload, Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { admin_content } from 'virtual:content';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContentItem {
  contentId: string;
  title: string;
  description: string | null;
  source: string | null;
  url: string;
  contentType: string | null;
  ageMin: number | null;
  ageMax: number | null;
  positions: string[];
  interests: string[];
  tags: string[];
  audience: string[];
  trainingMode: string | null;
  access: string | null;
  youtubeVideoId: string | null;
  embedVerified: boolean | null;
  linkBroken: boolean | null;
  reviewStatus: string | null;
  playbackStatus: string | null;
  deliveryMode: string | null;
  checkedDate: string | null;
  reviewNotes: string | null;
  recommendationStatus: string | null;
  adminStatus: string | null;
  adminReviewedAt: string | null;
  editorialPriority: number | null;
  createdAt: string | null;
}

type AdminStatus = 'approved' | 'unpublished' | 'archived' | 'pending';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-900/40 text-green-300 border-green-700',
  pending: 'bg-amber-900/40 text-amber-300 border-amber-700',
  unpublished: 'bg-slate-700/60 text-slate-300 border-slate-600',
  archived: 'bg-red-900/30 text-red-400 border-red-800',
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  youtube_video: 'YouTube',
  article: 'Article',
  article_and_video: 'Article+Video',
  article_and_video_session: 'Session',
  session_plan: 'Session Plan',
  video_session_page: 'Video Session',
  video_and_written_tutorial: 'Tutorial',
  coached_session: 'Coached',
  paid_program: 'Program',
  resource_guide: 'Guide',
};

function ageLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min}–${max}`;
  if (min !== null) return `${min}+`;
  if (max !== null) return `≤${max}`;
  return 'All ages';
}

// ─── Row component ────────────────────────────────────────────────────────────

function ContentRow({
  item,
  onStatusChange,
}: {
  item: ContentItem;
  onStatusChange: (id: string, status: AdminStatus) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function changeStatus(status: AdminStatus) {
    setBusy(true);
    await onStatusChange(item.contentId, status);
    setBusy(false);
  }

  const statusColor = STATUS_COLORS[item.adminStatus ?? 'pending'] ?? STATUS_COLORS.pending;
  const typeLabel = CONTENT_TYPE_LABELS[item.contentType ?? ''] ?? item.contentType ?? '—';
  const needsReview = item.recommendationStatus?.includes('admin-preview-required');

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      item.adminStatus === 'archived' ? 'border-border/40 opacity-60' : 'border-border'
    }`}>
      <div className="flex items-start gap-3 p-4">
        <span className={`shrink-0 mt-0.5 text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
          {item.adminStatus ?? 'pending'}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <span className="font-semibold text-foreground text-sm leading-snug">{item.title}</span>
            {needsReview && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700 font-medium shrink-0">
                {admin_content.previewRequiredLabel}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
            <span>{item.source ?? '—'}</span>
            <span>·</span>
            <span>{typeLabel}</span>
            <span>·</span>
            <span>Ages {ageLabel(item.ageMin, item.ageMax)}</span>
            {item.access && <><span>·</span><span>{item.access}</span></>}
            {item.editorialPriority !== null && (
              <><span>·</span><span>P{item.editorialPriority}</span></>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
            title="Open URL"
          >
            <ExternalLink size={14} />
          </a>

          {item.adminStatus !== 'approved' && (
            <button
              onClick={() => changeStatus('approved')}
              disabled={busy}
              title="Approve"
              className="p-1.5 rounded hover:bg-green-900/40 text-muted-foreground hover:text-green-300 transition-colors disabled:opacity-50"
            >
              <CheckCircle size={14} />
            </button>
          )}
          {item.adminStatus === 'approved' && (
            <button
              onClick={() => changeStatus('unpublished')}
              disabled={busy}
              title="Unpublish"
              className="p-1.5 rounded hover:bg-slate-700/60 text-muted-foreground hover:text-slate-300 transition-colors disabled:opacity-50"
            >
              <XCircle size={14} />
            </button>
          )}
          {item.adminStatus !== 'archived' && (
            <button
              onClick={() => changeStatus('archived')}
              disabled={busy}
              title="Archive"
              className="p-1.5 rounded hover:bg-red-900/30 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
            >
              <Archive size={14} />
            </button>
          )}

          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
            title={expanded ? admin_content.collapseLabel : admin_content.expandLabel}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-muted/10 p-4 space-y-3 text-sm">
          {item.description && (
            <p className="text-muted-foreground">{item.description}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div><span className="text-muted-foreground">Content ID:</span> <span className="font-mono text-foreground">{item.contentId}</span></div>
            <div><span className="text-muted-foreground">Positions:</span> <span className="text-foreground">{item.positions.join(', ') || '—'}</span></div>
            <div><span className="text-muted-foreground">Interests:</span> <span className="text-foreground">{item.interests.join(', ') || '—'}</span></div>
            <div><span className="text-muted-foreground">Audience:</span> <span className="text-foreground">{item.audience.join(', ') || '—'}</span></div>
            <div><span className="text-muted-foreground">Training mode:</span> <span className="text-foreground">{item.trainingMode ?? '—'}</span></div>
            <div><span className="text-muted-foreground">Checked:</span> <span className="text-foreground">{item.checkedDate ?? '—'}</span></div>
            {item.youtubeVideoId && (
              <div><span className="text-muted-foreground">YouTube ID:</span> <span className="font-mono text-foreground">{item.youtubeVideoId}</span></div>
            )}
            <div>
              <span className="text-muted-foreground">Embed verified:</span>{' '}
              <span className={item.embedVerified ? 'text-green-400' : 'text-amber-400'}>
                {item.embedVerified ? 'Yes' : 'No'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Link broken:</span>{' '}
              <span className={item.linkBroken ? 'text-red-400' : 'text-green-400'}>
                {item.linkBroken ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
          {item.reviewStatus && (
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Review status</p>
              <p className="text-xs text-foreground">{item.reviewStatus}</p>
            </div>
          )}
          {item.reviewNotes && (
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Review notes</p>
              <p className="text-xs text-foreground">{item.reviewNotes}</p>
            </div>
          )}
          {item.recommendationStatus && (
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Recommendation status</p>
              <p className="text-xs text-foreground">{item.recommendationStatus}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CSV Import panel ─────────────────────────────────────────────────────────

function ImportPanel({ onImported }: { onImported: () => void }) {
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; invalid: number; invalidDetails: string[] } | null>(null);
  const [error, setError] = useState('');

  async function handleImport() {
    if (!csvText.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/admin/content/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      });
      const data = await res.json() as typeof result & { error?: string };
      if (!res.ok) { setError(data.error ?? 'Import failed'); return; }
      setResult(data);
      onImported();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Upload size={16} className="text-primary" />
        <h3 className="font-semibold text-foreground">{admin_content.importHeading}</h3>
      </div>
      <textarea
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        placeholder={admin_content.importPlaceholder}
        rows={6}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
      />
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle size={12} /> {error}
        </p>
      )}
      {result && (
        <div className="text-xs space-y-1">
          <p className="text-green-400">✓ Inserted: {result.inserted} · Updated: {result.updated}</p>
          {result.invalid > 0 && (
            <div>
              <p className="text-amber-400">⚠ Invalid: {result.invalid}</p>
              {result.invalidDetails.slice(0, 5).map((d, i) => (
                <p key={i} className="text-muted-foreground pl-3">{d}</p>
              ))}
            </div>
          )}
        </div>
      )}
      <Button
        onClick={handleImport}
        disabled={loading || !csvText.trim()}
        size="sm"
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {loading ? admin_content.importingLabel : admin_content.importButtonLabel}
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminContentPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isPending } = useSession();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (!isPending && !isAuthenticated) navigate('/login/auth?returnTo=/admin/content');
  }, [isPending, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isPending && isAuthenticated && user && !(user as { isAdmin?: boolean }).isAdmin) {
      navigate('/');
    }
  }, [isPending, isAuthenticated, user, navigate]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? `?adminStatus=${statusFilter}` : '';
      const res = await fetch(`/api/admin/content${params}`);
      if (res.ok) {
        const data = await res.json() as ContentItem[];
        setItems(data);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (isAuthenticated) void fetchItems();
  }, [isAuthenticated, fetchItems]);

  async function handleStatusChange(contentId: string, adminStatus: AdminStatus) {
    await fetch(`/api/admin/content/${contentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminStatus }),
    });
    setItems((prev) => prev.map((i) =>
      i.contentId === contentId ? { ...i, adminStatus } : i
    ));
  }

  const displayed = items.filter((i) => typeFilter === 'all' || i.contentType === typeFilter);

  const counts = {
    all: items.length,
    approved: items.filter((i) => i.adminStatus === 'approved').length,
    pending: items.filter((i) => i.adminStatus === 'pending').length,
    unpublished: items.filter((i) => i.adminStatus === 'unpublished').length,
    archived: items.filter((i) => i.adminStatus === 'archived').length,
  };

  const contentTypes = [...new Set(items.map((i) => i.contentType).filter(Boolean))].sort() as string[];

  const STATUS_TABS = [
    { key: 'all', label: admin_content.statusAll },
    { key: 'approved', label: admin_content.statusApproved },
    { key: 'pending', label: admin_content.statusPending },
    { key: 'unpublished', label: admin_content.statusUnpublished },
    { key: 'archived', label: admin_content.statusArchived },
  ] as const;

  if (isPending) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </main>
    );
  }

  return (
    <>
      <Helmet>
        <title>{admin_content.pageTitle} — Soccer Center</title>
        <meta name="description" content="Admin content management for Soccer Center development content catalog." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <main className="min-h-screen bg-background py-8 px-4">
        <div className="max-w-5xl mx-auto space-y-6">

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                {admin_content.pageTitle}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {counts.all} {admin_content.pageSubtitle}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchItems()}
                className="gap-1.5"
              >
                <RefreshCw size={13} /> {admin_content.refreshLabel}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImport((v) => !v)}
                className="gap-1.5"
              >
                <Upload size={13} /> {showImport ? admin_content.hideCsvLabel : admin_content.importCsvLabel}
              </Button>
            </div>
          </div>

          {showImport && (
            <ImportPanel onImported={() => { void fetchItems(); setShowImport(false); }} />
          )}

          <div className="flex gap-1 flex-wrap">
            {STATUS_TABS.map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  statusFilter === s.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}
              >
                {s.label}{' '}
                <span className="opacity-70">
                  {s.key === 'all' ? counts.all : counts[s.key]}
                </span>
              </button>
            ))}
          </div>

          {contentTypes.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={13} className="text-muted-foreground shrink-0" />
              <button
                onClick={() => setTypeFilter('all')}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  typeFilter === 'all'
                    ? 'bg-secondary/20 border-secondary text-secondary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {admin_content.allTypesLabel}
              </button>
              {contentTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    typeFilter === t
                      ? 'bg-secondary/20 border-secondary text-secondary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {CONTENT_TYPE_LABELS[t] ?? t}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : displayed.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>{admin_content.noItemsMessage}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayed.map((item) => (
                <ContentRow
                  key={item.contentId}
                  item={item}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
