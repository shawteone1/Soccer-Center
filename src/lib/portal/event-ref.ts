/**
 * buildEventRef
 *
 * Single source of truth for the stable event_ref / gameEventRef string
 * used across match records, media assignments, and the game selector.
 *
 * Rules:
 *   - Feed events:   `${feedId}:${uid}`
 *     Scopes the iCal UID to its originating feed so two feeds that happen
 *     to share a UID (non-standard but possible) never collide in match records.
 *   - Manual events: the row id (stable — never regenerated on sync).
 *
 * Legacy records saved before the composite scheme used the plain event.id
 * (the iCal UID without a feed prefix). The loaders in GameDetailsPanel check
 * both forms so those records are still found.
 *
 * Import this wherever an event_ref / gameEventRef is constructed or compared:
 *   - GameDetailsPanel  (stats save, media assignment, record lookup, media filter)
 *   - PlayerMediaTab    (media assignment on upload)
 *   - GameSelector      (passes the full event object; callers call buildEventRef)
 */

export interface EventRefSource {
  /** The event's id field as returned by the schedule endpoint (uid || rowId for feed events). */
  id: string;
  source: 'manual' | 'feed';
  /** Present for feed events — the sc_calendar_feeds row id. */
  feedId?: string | null;
}

/**
 * Returns the stable event_ref string for a schedule event.
 *
 * Feed events  → `${feedId}:${id}`   (composite; feed-scoped)
 * Manual events → `${id}`             (row id; never regenerated)
 */
export function buildEventRef(event: EventRefSource): string {
  if (event.source === 'feed' && event.feedId) {
    return `${event.feedId}:${event.id}`;
  }
  return event.id;
}

/**
 * Returns true if a stored event_ref matches this event.
 *
 * Checks both the current composite form and the legacy plain-id form so
 * records saved before the composite scheme was introduced are still found.
 *
 * Never matches null / undefined stored refs.
 */
export function eventRefMatches(
  storedRef: string | null | undefined,
  event: EventRefSource,
): boolean {
  if (!storedRef) return false;
  const current = buildEventRef(event);
  // Primary: composite (or manual row id)
  if (storedRef === current) return true;
  // Legacy fallback: plain event.id saved before composite scheme
  if (storedRef === event.id) return true;
  return false;
}
