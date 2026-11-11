/**
 * DeletePlayerDialog — confirmation dialog for soft-deleting a player profile.
 *
 * Design rules:
 *  - Names the player explicitly.
 *  - Explains exactly what is removed vs. what is preserved.
 *  - Requires a button click to confirm — no typed confirmation required.
 *  - Cancel makes no changes.
 *  - Does not report success until the server confirms it.
 *  - After success, shows an "Undo removal" option for 30 seconds.
 *    The player remains in the database (soft-deleted) and can be restored
 *    at any time via the restore endpoint — the 30-second window is a
 *    convenience shortcut, not the only recovery path.
 *  - Removal is described as "remove from My Players" — not "permanent deletion".
 *  - If the soft-delete migration has not been run, shows a clear setup-required
 *    error and leaves the player untouched.
 */

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Loader2, X, RotateCcw, Check, Info } from 'lucide-react';

interface DeletePlayerDialogProps {
  playerId: string;
  playerName: string;
  onClose: () => void;
  /** Called after the player is successfully removed (and the undo window closes or user clicks Done). */
  onDeleted: (playerId: string) => void;
  /** Called if the user restores the player during the undo window. */
  onRestored?: (playerId: string) => void;
}

const UNDO_WINDOW_MS = 30_000;

export default function DeletePlayerDialog({
  playerId,
  playerName,
  onClose,
  onDeleted,
  onRestored,
}: DeletePlayerDialogProps) {
  const [phase, setPhase] = useState<'confirm' | 'deleting' | 'deleted' | 'restoring' | 'error' | 'schema_required'>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(UNDO_WINDOW_MS / 1000);
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const undoDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start the undo countdown once the player is deleted.
  // The countdown is a UI convenience — the player remains soft-deleted in the
  // database and can be restored via the restore endpoint even after this dialog closes.
  useEffect(() => {
    if (phase !== 'deleted') return;

    const deadline = Date.now() + UNDO_WINDOW_MS;
    setUndoSecondsLeft(Math.ceil(UNDO_WINDOW_MS / 1000));

    undoTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setUndoSecondsLeft(remaining);
    }, 500);

    undoDeadlineRef.current = setTimeout(() => {
      clearInterval(undoTimerRef.current ?? undefined);
      onDeleted(playerId);
      onClose();
    }, UNDO_WINDOW_MS);

    return () => {
      clearInterval(undoTimerRef.current ?? undefined);
      clearTimeout(undoDeadlineRef.current ?? undefined);
    };
  }, [phase, playerId, onDeleted, onClose]);

  async function handleDelete() {
    setPhase('deleting');
    setError(null);
    try {
      const res = await fetch(`/api/parent/players/${encodeURIComponent(playerId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string; message?: string };
        if (d.error === 'SCHEMA_REQUIRED') {
          setPhase('schema_required');
          return;
        }
        throw new Error(d.message ?? d.error ?? `HTTP ${res.status}`);
      }
      setPhase('deleted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Removal failed. The player has not been changed.');
      setPhase('error');
    }
  }

  async function handleUndo() {
    clearInterval(undoTimerRef.current ?? undefined);
    clearTimeout(undoDeadlineRef.current ?? undefined);
    setPhase('restoring');
    try {
      const res = await fetch(`/api/parent/players/${encodeURIComponent(playerId)}/restore`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      onRestored?.(playerId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed. Contact support to recover this player.');
      setPhase('error');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'hsl(var(--pp-modal-backdrop))' }}
      onClick={phase === 'confirm' || phase === 'error' || phase === 'schema_required' ? onClose : undefined}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Schema-required phase ── */}
        {phase === 'schema_required' && (
          <>
            <div
              className="px-5 py-4 flex items-center justify-between border-b"
              style={{ borderColor: 'hsl(var(--pp-border))' }}
            >
              <div className="flex items-center gap-2">
                <Info size={16} style={{ color: 'hsl(var(--pp-navy))' }} />
                <h2 className="text-base font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
                  Setup required
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1"
                style={{ color: 'hsl(var(--pp-text-muted))' }}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <p className="text-sm" style={{ color: 'hsl(var(--pp-text))' }}>
                Player removal is not yet available on this deployment.
              </p>
              <div
                className="rounded-xl p-4 text-xs space-y-2"
                style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
              >
                <p className="font-semibold">What needs to happen</p>
                <p>
                  An admin must run the <strong>Player Soft-Delete Migration</strong> from
                  Settings → Admin panel. This is a one-time, additive database change that
                  enables recoverable player removal. No existing data is affected.
                </p>
              </div>
              <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {playerName} has not been changed.
              </p>
            </div>
            <div
              className="px-5 py-4 flex justify-end border-t"
              style={{ borderColor: 'hsl(var(--pp-border))' }}
            >
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
              >
                Close
              </button>
            </div>
          </>
        )}

        {/* ── Confirm / deleting / error phase ── */}
        {(phase === 'confirm' || phase === 'deleting' || phase === 'error') && (
          <>
            {/* Header */}
            <div
              className="px-5 py-4 flex items-center justify-between border-b"
              style={{ borderColor: 'hsl(var(--pp-border))' }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} style={{ color: 'hsl(var(--destructive))' }} />
                <h2 className="text-base font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
                  Remove player
                </h2>
              </div>
              {phase !== 'deleting' && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-1"
                  style={{ color: 'hsl(var(--pp-text-muted))' }}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4">
              <p className="text-sm" style={{ color: 'hsl(var(--pp-text))' }}>
                You are removing <span className="font-semibold">{playerName}</span> from My Players.
              </p>

              {/* What happens */}
              <div
                className="rounded-xl p-4 space-y-2 text-xs"
                style={{ background: 'hsl(var(--pp-page-bg))', border: '1px solid hsl(var(--pp-border))' }}
              >
                <p className="font-semibold text-sm" style={{ color: 'hsl(var(--pp-text))' }}>
                  What will be removed
                </p>
                <ul className="space-y-1 list-disc list-inside" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  <li>Player profile, position, and age group</li>
                  <li>Season stats and game records for this player</li>
                  <li>Media assignments and highlight collections</li>
                  <li>Calendar event associations for this player</li>
                  <li>Recruiting saved items and outreach drafts</li>
                  <li>Sharing links and coach-view previews</li>
                </ul>

                <p className="font-semibold text-sm pt-2" style={{ color: 'hsl(var(--pp-text))' }}>
                  What is preserved
                </p>
                <ul className="space-y-1 list-disc list-inside" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  <li>Your other players and their records</li>
                  <li>Shared media files and videos (not deleted)</li>
                  <li>Calendar feeds and team events shared with other players</li>
                  <li>Your account and profile</li>
                </ul>
              </div>

              {/* Undo notice — accurate: soft-delete, not permanent */}
              <div
                className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2"
                style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
              >
                <RotateCcw size={12} className="mt-0.5 shrink-0" />
                <p>
                  <span className="font-semibold">This is recoverable.</span> The player record is
                  kept in the database and can be restored. After removing, you will have 30 seconds
                  to undo directly from this screen.
                </p>
              </div>

              {error && (
                <div
                  className="rounded-lg px-3 py-2.5 text-xs"
                  style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}
                >
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="px-5 py-4 flex items-center justify-end gap-3 border-t"
              style={{ borderColor: 'hsl(var(--pp-border))' }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={phase === 'deleting'}
                className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={phase === 'deleting'}
                className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
                style={{ background: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))' }}
              >
                {phase === 'deleting' ? (
                  <><Loader2 size={14} className="animate-spin" /> Removing…</>
                ) : (
                  'Remove player'
                )}
              </button>
            </div>
          </>
        )}

        {/* ── Deleted / undo phase ── */}
        {(phase === 'deleted' || phase === 'restoring') && (
          <div className="px-5 py-6 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'hsl(var(--pp-blue-light))' }}
              >
                <Check size={18} style={{ color: 'hsl(var(--pp-navy))' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                  {playerName} removed from My Players
                </p>
                <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Undo available for {undoSecondsLeft}s — the record is kept and can be restored
                </p>
              </div>
            </div>

            {/* Undo progress bar */}
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: 'hsl(var(--pp-border))' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(undoSecondsLeft / (UNDO_WINDOW_MS / 1000)) * 100}%`,
                  background: 'hsl(var(--pp-navy))',
                  transition: 'width 0.5s linear',
                }}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleUndo()}
                disabled={phase === 'restoring'}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border transition-colors disabled:opacity-50"
                style={{ borderColor: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-navy))', background: 'transparent' }}
              >
                {phase === 'restoring' ? (
                  <><Loader2 size={14} className="animate-spin" /> Restoring…</>
                ) : (
                  <><RotateCcw size={14} /> Undo removal</>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearInterval(undoTimerRef.current ?? undefined);
                  clearTimeout(undoDeadlineRef.current ?? undefined);
                  onDeleted(playerId);
                  onClose();
                }}
                disabled={phase === 'restoring'}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
