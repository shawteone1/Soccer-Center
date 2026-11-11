/**
 * CoachRequests.tsx
 *
 * CoachRequestForm — submitted by a coach through a real coach profile link.
 *   POST /api/coach/profile/:token/requests
 *   Shows confirmation only after a successful 201 response.
 *   Handles rate-limit (429), duplicate (409), and validation (400) errors.
 *
 * CoachRequestInbox — parent-only view of received requests.
 *   GET /api/parent/players/:playerId/coach-requests
 *   Authenticated; shows real DB rows.
 *
 * DemoCoachRequestForm — demo-only localStorage stub (unchanged).
 *   Used when isDemoLink=true in CoachProfileCard.
 */

import { useEffect, useState, useCallback } from 'react';

// ── Demo stub (localStorage — unchanged from original) ────────────────────────

const demoKey = (id: string) => `sc_demo_requests_${id}`;

type DemoRequest = {
  id: string; name: string; email: string; kind: string; note: string; createdAt: string;
};

export function DemoCoachRequestForm({ playerId }: { playerId: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  if (done) {
    return (
      <p role="status" className="text-sm">
        Request saved to the synthetic parent inbox. No external message was sent.
      </p>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={e => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        try {
          const items: DemoRequest[] = JSON.parse(localStorage.getItem(demoKey(playerId)) || '[]');
          items.unshift({
            id: crypto.randomUUID(),
            name: String(data.get('name') ?? ''),
            email: String(data.get('email') ?? ''),
            kind: String(data.get('kind') ?? ''),
            note: String(data.get('note') ?? ''),
            createdAt: new Date().toISOString(),
          });
          localStorage.setItem(demoKey(playerId), JSON.stringify(items));
          window.dispatchEvent(new Event('coach-request'));
          setDone(true);
        } catch {
          setError('Request could not be saved. Please try again.');
        }
      }}
    >
      <p className="text-xs text-slate-500">Demo request · appears in the parent inbox in this browser</p>
      <label className="block text-sm font-medium">
        Coach name
        <input className="mt-1 block w-full border rounded p-2 text-sm" name="name" required maxLength={120} />
      </label>
      <label className="block text-sm font-medium">
        Reply email
        <input className="mt-1 block w-full border rounded p-2 text-sm" name="email" type="email" required />
      </label>
      <label className="block text-sm font-medium">
        Request
        <select name="kind" className="mt-1 block w-full border rounded p-2 text-sm">
          <option>Full-match footage</option>
          <option>Academic information</option>
          <option>Club-coach reference</option>
          <option>Updated playing schedule</option>
          <option>Conversation / event invitation</option>
        </select>
      </label>
      <label className="block text-sm font-medium">
        Message
        <textarea className="mt-1 block w-full border rounded p-2 text-sm" name="note" required maxLength={2000} rows={4} />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="rounded px-4 py-2 text-sm font-medium bg-slate-900 text-white">
        Submit demo request
      </button>
    </form>
  );
}

export function DemoCoachRequestInbox({ playerId }: { playerId: string }) {
  const [items, setItems] = useState<DemoRequest[]>([]);
  useEffect(() => {
    const read = () => {
      try { setItems(JSON.parse(localStorage.getItem(demoKey(playerId)) || '[]')); }
      catch { setItems([]); }
    };
    read();
    window.addEventListener('storage', read);
    window.addEventListener('coach-request', read);
    return () => {
      window.removeEventListener('storage', read);
      window.removeEventListener('coach-request', read);
    };
  }, [playerId]);
  return (
    <section className="rounded-xl border bg-white p-4 text-slate-900">
      <h3 className="font-bold mb-2">Coach requests · synthetic inbox</h3>
      {items.length === 0
        ? <p className="text-sm text-slate-500">Requests submitted from the demo coach view appear here.</p>
        : items.map(r => (
          <article key={r.id} className="border-t py-3">
            <strong className="text-sm">{r.kind}</strong>
            <p className="text-sm">{r.name} · {r.email}</p>
            <p className="text-sm whitespace-pre-wrap mt-1">{r.note}</p>
            <small className="text-slate-400">{new Date(r.createdAt).toLocaleString()}</small>
          </article>
        ))
      }
    </section>
  );
}

// ── Real implementation ───────────────────────────────────────────────────────

/**
 * CoachRequestForm — used on real coach profile links.
 * Requires the raw token from the URL (passed as prop by CoachProfileCard).
 * POSTs to /api/coach/profile/:token/requests.
 * Shows confirmation only after a successful 201 response.
 */
export function CoachRequestForm({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setState('submitting');
    setError('');
    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/coach/profile/${encodeURIComponent(token)}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterName:  String(data.get('requesterName')  ?? '').trim(),
          requesterEmail: String(data.get('requesterEmail') ?? '').trim(),
          message:        String(data.get('message')        ?? '').trim(),
        }),
      });
      if (res.status === 201) {
        setState('done');
        return;
      }
      let msg = 'Submission failed. Please try again.';
      try {
        const body = await res.json() as { error?: string };
        if (res.status === 429) msg = body.error ?? 'Too many requests. Please try again tomorrow.';
        else if (res.status === 409) msg = body.error ?? 'A request from this email was already submitted today.';
        else if (res.status === 400) msg = body.error ?? 'Please check your entries and try again.';
        else msg = body.error ?? msg;
      } catch { /* ignore */ }
      setError(msg);
      setState('idle');
    } catch {
      setError('Network error. Please check your connection and try again.');
      setState('idle');
    }
  }, [token]);

  if (state === 'done') {
    return (
      <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        <p className="font-medium">Request submitted</p>
        <p className="mt-1 text-green-700">
          Your request has been sent to the player's family. They will follow up directly.
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={e => { void handleSubmit(e); }}>
      <label className="block text-sm font-medium">
        Your name
        <input
          className="mt-1 block w-full border rounded p-2 text-sm"
          name="requesterName"
          required
          maxLength={120}
          autoComplete="name"
        />
      </label>
      <label className="block text-sm font-medium">
        Reply email
        <input
          className="mt-1 block w-full border rounded p-2 text-sm"
          name="requesterEmail"
          type="email"
          required
          autoComplete="email"
        />
      </label>
      <label className="block text-sm font-medium">
        Message
        <textarea
          className="mt-1 block w-full border rounded p-2 text-sm"
          name="message"
          required
          maxLength={2000}
          rows={4}
          placeholder="Introduce yourself and describe what you'd like to know."
        />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={state === 'submitting'}
        className="rounded px-4 py-2 text-sm font-medium bg-slate-900 text-white disabled:opacity-50"
      >
        {state === 'submitting' ? 'Sending…' : 'Send request'}
      </button>
    </form>
  );
}

// ── Parent inbox ──────────────────────────────────────────────────────────────

type InboxRequest = {
  id: string;
  linkId: string;
  linkLabel: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  message: string | null;
  status: string;
  createdAt: string | null;
};

/**
 * CoachRequestInbox — parent-only view of received requests.
 * Fetches from /api/parent/players/:playerId/coach-requests.
 * Requires COACH_PROFILE_LINKS_ENABLED=true on the server.
 */
export function CoachRequestInbox({ playerId }: { playerId: string }) {
  const [items, setItems] = useState<InboxRequest[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'unavailable'>('loading');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/parent/players/${encodeURIComponent(playerId)}/coach-requests`);
        if (res.status === 403) { if (!cancelled) setState('unavailable'); return; }
        if (!res.ok) { if (!cancelled) setState('error'); return; }
        const data = await res.json() as { requests: InboxRequest[] };
        if (!cancelled) { setItems(data.requests); setState('ready'); }
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  if (state === 'loading') return <p className="text-sm text-slate-500">Loading requests…</p>;
  if (state === 'unavailable') return null; // feature not enabled
  if (state === 'error') return <p className="text-sm text-red-600">Could not load requests.</p>;

  return (
    <section className="rounded-xl border bg-white p-4 text-slate-900">
      <h3 className="font-bold mb-2 text-sm">Coach requests</h3>
      {items.length === 0
        ? <p className="text-sm text-slate-500">No requests yet. Requests submitted through your shared links appear here.</p>
        : items.map(r => (
          <article key={r.id} className="border-t py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{r.requesterName ?? '(no name)'}</p>
                <p className="text-xs text-slate-500">{r.requesterEmail ?? ''}</p>
                {r.linkLabel && <p className="text-xs text-slate-400 mt-0.5">Link: {r.linkLabel}</p>}
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded ${r.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                {r.status}
              </span>
            </div>
            {r.message && <p className="text-sm mt-2 whitespace-pre-wrap">{r.message}</p>}
            {r.createdAt && <small className="text-slate-400 text-xs">{new Date(r.createdAt).toLocaleString()}</small>}
          </article>
        ))
      }
    </section>
  );
}

// ── Legacy export alias (used by CoachProfileCard for demo mode) ──────────────
// CoachProfileCard imports { CoachRequestForm } — for demo links it now uses
// DemoCoachRequestForm via the isDemoLink branch. This alias is kept so any
// other import of CoachRequestForm still compiles.
