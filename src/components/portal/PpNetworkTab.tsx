/**
 * PpNetworkTab — Network connections for the Parent Portal.
 *
 * Features:
 *   - Send a connection request by email address
 *   - View pending sent/received requests
 *   - Accept or reject received requests
 *   - Cancel sent requests
 *   - Remove accepted connections
 *   - Connections are separate from guardian access to players/calendars
 *   - No public minor profiles; no public posting
 *
 * API:
 *   GET    /api/parent/connections
 *   POST   /api/parent/connections       { email, message? }
 *   PATCH  /api/parent/connections/:id   { action: 'accept'|'reject' }
 *   DELETE /api/parent/connections/:id
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Check, X, Loader2, AlertCircle, UserMinus,
  Clock, Info,
} from 'lucide-react';
import { PpCard, PpSectionHeading, PpButton, PpBadge, PpDivider } from './PpPrimitives';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Connection {
  id: string;
  peerId: string;
  peerEmail: string | null;
  peerName: string | null;
  direction: 'sent' | 'received';
  status: string;
  message: string | null;
  acceptedAt: string | null;
  createdAt: string | null;
}

interface ConnectionsData {
  sent: Connection[];
  received: Connection[];
  accepted: Connection[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

function peerDisplay(conn: Connection) {
  return conn.peerName ?? conn.peerEmail ?? conn.peerId;
}

function formatDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Connection row ───────────────────────────────────────────────────────────

function ConnectionRow({
  conn,
  onAccept,
  onReject,
  onRemove,
  actionLoading,
}: {
  conn: Connection;
  onAccept?: () => void;
  onReject?: () => void;
  onRemove?: () => void;
  actionLoading: boolean;
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-3 border-b"
      style={{ borderColor: 'hsl(var(--pp-border))' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
          style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
        >
          {(peerDisplay(conn)[0] ?? '?').toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--pp-text))' }}>
            {peerDisplay(conn)}
          </p>
          {conn.message && (
            <p className="text-xs truncate mt-0.5 italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              "{conn.message}"
            </p>
          )}
          <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {conn.status === 'accepted'
              ? `Connected since ${formatDate(conn.acceptedAt)}`
              : conn.direction === 'sent'
                ? `Request sent ${formatDate(conn.createdAt)}`
                : `Request received ${formatDate(conn.createdAt)}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {conn.status === 'pending' && conn.direction === 'received' && (
          <>
            <button
              type="button"
              onClick={onAccept}
              disabled={actionLoading}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border transition-colors"
              style={{ borderColor: 'hsl(var(--pp-navy))', background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
              title="Accept"
            >
              {actionLoading ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Accept
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={actionLoading}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border transition-colors"
              style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
              title="Decline"
            >
              <X size={11} />
              Decline
            </button>
          </>
        )}
        {conn.status === 'pending' && conn.direction === 'sent' && (
          <button
            type="button"
            onClick={onRemove}
            disabled={actionLoading}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border transition-colors"
            style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
            title="Cancel request"
          >
            {actionLoading ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
            Cancel
          </button>
        )}
        {conn.status === 'accepted' && (
          <button
            type="button"
            onClick={onRemove}
            disabled={actionLoading}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border transition-colors"
            style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
            title="Remove connection"
          >
            {actionLoading ? <Loader2 size={11} className="animate-spin" /> : <UserMinus size={11} />}
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PpNetworkTab() {
  const [data, setData] = useState<ConnectionsData>({ sent: [], received: [], accepted: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Send request form
  const [emailInput, setEmailInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/parent/connections');
      if (!res.ok) throw new Error('Failed to load connections');
      const d = await res.json() as ConnectionsData;
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  async function handleSendRequest() {
    if (!emailInput.trim()) { setSendError('Enter an email address.'); return; }
    setSendLoading(true);
    setSendError(null);
    setSendSuccess(false);
    try {
      const res = await apiFetch('/api/parent/connections', {
        method: 'POST',
        body: JSON.stringify({ email: emailInput.trim(), message: messageInput.trim() || undefined }),
      });
      const d = await res.json() as { id?: string; error?: string };
      if (!res.ok) { setSendError(d.error ?? 'Failed to send request'); return; }
      setSendSuccess(true);
      setEmailInput('');
      setMessageInput('');
      await loadConnections();
    } finally {
      setSendLoading(false);
    }
  }

  async function handleAccept(id: string) {
    setActionLoading(id);
    try {
      await apiFetch(`/api/parent/connections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept' }),
      });
      await loadConnections();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: string) {
    setActionLoading(id);
    try {
      await apiFetch(`/api/parent/connections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reject' }),
      });
      await loadConnections();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRemove(id: string) {
    setActionLoading(id);
    try {
      await apiFetch(`/api/parent/connections/${id}`, { method: 'DELETE' });
      await loadConnections();
    } finally {
      setActionLoading(null);
    }
  }

  const totalPending = data.received.length + data.sent.length;

  return (
    <div className="space-y-5">

      {/* Privacy notice */}
      <div
        className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs"
        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
      >
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          <strong>Connections are separate from guardian access.</strong> Accepting a connection does not grant access to your players or calendar. Use Settings → Family access to manage guardian permissions.
          Posts shared with "Connections" are visible only to accepted connections.
          Minor player profiles are never public.
        </span>
      </div>

      {/* Send request */}
      <PpCard>
        <PpSectionHeading>
          <UserPlus size={14} className="inline mr-1.5" />
          Connect with a soccer family
        </PpSectionHeading>
        <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Enter the email address of another parent portal account.
        </p>
        <div className="space-y-2">
          <input
            type="email"
            value={emailInput}
            onChange={e => { setEmailInput(e.target.value); setSendError(null); setSendSuccess(false); }}
            placeholder="parent@example.com"
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
            style={{
              borderColor: sendError ? 'hsl(var(--pp-badge-error-fg))' : 'hsl(var(--pp-border))',
              background: 'hsl(var(--pp-page-bg))',
              color: 'hsl(var(--pp-text))',
            }}
            onKeyDown={e => { if (e.key === 'Enter') handleSendRequest(); }}
          />
          <input
            type="text"
            value={messageInput}
            onChange={e => setMessageInput(e.target.value)}
            placeholder="Optional message…"
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{
              borderColor: 'hsl(var(--pp-border))',
              background: 'hsl(var(--pp-page-bg))',
              color: 'hsl(var(--pp-text))',
            }}
            maxLength={256}
          />
          {sendError && (
            <p className="text-xs flex items-center gap-1" style={{ color: 'hsl(var(--pp-badge-error-fg))' }}>
              <AlertCircle size={11} />
              {sendError}
            </p>
          )}
          {sendSuccess && (
            <p className="text-xs flex items-center gap-1" style={{ color: 'hsl(var(--pp-badge-success-fg))' }}>
              <Check size={11} />
              Connection request sent.
            </p>
          )}
          <PpButton size="sm" onClick={handleSendRequest} disabled={sendLoading || !emailInput.trim()}>
            {sendLoading ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
            Send request
          </PpButton>
        </div>
      </PpCard>

      {/* Connections list */}
      <PpCard>
        <div className="flex items-center justify-between mb-4">
          <PpSectionHeading>
            <Users size={14} className="inline mr-1.5" />
            My connections
          </PpSectionHeading>
          {totalPending > 0 && (
            <PpBadge variant="warning">
              {totalPending} pending
            </PpBadge>
          )}
        </div>

        {loading && (
          <div className="py-6 flex justify-center">
            <Loader2 size={18} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
          </div>
        )}

        {error && (
          <p className="text-sm py-4 text-center" style={{ color: 'hsl(var(--pp-text-muted))' }}>{error}</p>
        )}

        {!loading && !error && (
          <>
            {/* Received requests */}
            {data.received.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock size={12} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                  <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    Requests received ({data.received.length})
                  </p>
                </div>
                {data.received.map(conn => (
                  <ConnectionRow
                    key={conn.id}
                    conn={conn}
                    onAccept={() => handleAccept(conn.id)}
                    onReject={() => handleReject(conn.id)}
                    actionLoading={actionLoading === conn.id}
                  />
                ))}
              </div>
            )}

            {/* Sent requests */}
            {data.sent.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock size={12} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                  <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    Requests sent ({data.sent.length})
                  </p>
                </div>
                {data.sent.map(conn => (
                  <ConnectionRow
                    key={conn.id}
                    conn={conn}
                    onRemove={() => handleRemove(conn.id)}
                    actionLoading={actionLoading === conn.id}
                  />
                ))}
              </div>
            )}

            {/* Accepted connections */}
            {data.accepted.length > 0 && (
              <div>
                {(data.received.length > 0 || data.sent.length > 0) && <PpDivider />}
                <div className="flex items-center gap-1.5 mb-2 mt-3">
                  <Users size={12} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                  <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    Connected ({data.accepted.length})
                  </p>
                </div>
                {data.accepted.map(conn => (
                  <ConnectionRow
                    key={conn.id}
                    conn={conn}
                    onRemove={() => handleRemove(conn.id)}
                    actionLoading={actionLoading === conn.id}
                  />
                ))}
              </div>
            )}

            {data.sent.length === 0 && data.received.length === 0 && data.accepted.length === 0 && (
              <div className="py-6 text-center">
                <Users size={28} className="mx-auto mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }} />
                <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  No connections yet. Send a request above to get started.
                </p>
              </div>
            )}
          </>
        )}
      </PpCard>
    </div>
  );
}
