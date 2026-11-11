/**
 * Portal Demo — localStorage persistence hook.
 *
 * All keys are prefixed sc_demo_pp_* so reset() only clears demo data.
 * Real profiles, records, preferences and auth are never touched.
 *
 * Stored state:
 *   sc_demo_pp_selection   — { clubId, programId, ageGroup, teamId, playerId }
 *   sc_demo_pp_stats       — Record<`${playerId}:${eventId}`, DemoStatEntry>
 *   sc_demo_pp_visibility  — Record<eventId, boolean>  (true = visible)
 *   sc_demo_pp_cal_filter  — 'all' | 'games' | 'practices'
 *   sc_demo_pp_sched_view  — 'list' | 'calendar'
 *   sc_demo_pp_photos      — Record<playerId, string>  (data-URL, ≤200 KB each)
 *   sc_demo_pp_media       — DemoMediaItem[]  (user-added media items)
 *   sc_demo_pp_assignments — Record<mediaItemId, string[]>  (extra player assignments)
 *
 * File blobs (photos/videos) are stored in IndexedDB (sc_demo_media DB) via
 * use-media-idb.ts. Collections (named highlight playlists) also live in IDB.
 *
 * Photo storage notes:
 *   - Photos are stored as base64 data-URLs in localStorage.
 *   - Each photo is capped at MAX_PHOTO_BYTES (200 KB base64) before storing.
 *   - If localStorage quota is exceeded the write is silently dropped and
 *     photoError is set to a user-readable message.
 *   - Photos are keyed by playerId so switching players never cross-contaminates.
 *   - reset() removes all sc_demo_pp_* keys including photos and calls idbResetAll().
 */

import { useState, useCallback, useEffect } from 'react';
import type { DemoMediaItem } from './portal-demo-data';
import { idbResetAll } from './use-media-idb';
import type { TryoutSavedMap, TryoutCalSet } from '@/components/portal/DemoTryoutsTab';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DemoSelection {
  clubId: string;
  programId: string;
  ageGroup: string;
  teamId: string;
  playerId: string;
}

export interface DemoStatEntry {
  goals:    number | null;
  assists:  number | null;
  ga:       number | null;
  saves:    number | null;
  shutouts: number | null;
  played:   boolean;
}

export type CalFilter   = 'all' | 'games' | 'practices';
export type SchedView   = 'list' | 'calendar';

// ─── Keys ─────────────────────────────────────────────────────────────────────

const KEY_SELECTION      = 'sc_demo_pp_selection';
const KEY_STATS          = 'sc_demo_pp_stats';
const KEY_VISIBILITY     = 'sc_demo_pp_visibility';
const KEY_CAL_FILTER     = 'sc_demo_pp_cal_filter';
const KEY_SCHED_VIEW     = 'sc_demo_pp_sched_view';
const KEY_PHOTOS         = 'sc_demo_pp_photos';
const KEY_MEDIA          = 'sc_demo_pp_media';
const KEY_ASSIGNMENTS    = 'sc_demo_pp_assignments';
const KEY_TRYOUT_SAVED   = 'sc_demo_pp_tryout_saved';
const KEY_TRYOUT_CAL     = 'sc_demo_pp_tryout_cal';

const DEMO_KEYS = [
  KEY_SELECTION, KEY_STATS, KEY_VISIBILITY,
  KEY_CAL_FILTER, KEY_SCHED_VIEW, KEY_PHOTOS, KEY_MEDIA, KEY_ASSIGNMENTS,
  KEY_TRYOUT_SAVED, KEY_TRYOUT_CAL,
];

/**
 * Maximum base64 data-URL size per photo (200 KB).
 * A 200 KB base64 string ≈ 150 KB raw image — enough for a clear avatar.
 * localStorage is typically 5 MB total; 5 teams × 15 players = 75 slots,
 * but only photos actually set by the user are stored.
 */
const MAX_PHOTO_BYTES = 200 * 1024;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): 'ok' | 'quota' {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return 'ok';
  } catch {
    return 'quota';
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePortalDemo() {
  const [selection, setSelectionState] = useState<DemoSelection>(() =>
    lsGet<DemoSelection>(KEY_SELECTION, {
      clubId: '', programId: '', ageGroup: '', teamId: '', playerId: '',
    })
  );

  const [stats, setStatsState] = useState<Record<string, DemoStatEntry>>(() =>
    lsGet<Record<string, DemoStatEntry>>(KEY_STATS, {})
  );

  const [visibility, setVisibilityState] = useState<Record<string, boolean>>(() =>
    lsGet<Record<string, boolean>>(KEY_VISIBILITY, {})
  );

  const [calFilter, setCalFilterState] = useState<CalFilter>(() =>
    lsGet<CalFilter>(KEY_CAL_FILTER, 'all')
  );

  const [schedView, setSchedViewState] = useState<SchedView>(() =>
    lsGet<SchedView>(KEY_SCHED_VIEW, 'list')
  );

  /** playerId → data-URL (jpeg/png, ≤200 KB base64) */
  const [photos, setPhotosState] = useState<Record<string, string>>(() =>
    lsGet<Record<string, string>>(KEY_PHOTOS, {})
  );

  /** User-added media items (simulated uploads) */
  const [mediaItems, setMediaItemsState] = useState<DemoMediaItem[]>(() =>
    lsGet<DemoMediaItem[]>(KEY_MEDIA, [])
  );

  /**
   * Extra player assignments: mediaItemId → additional playerIds.
   * The item's own playerId is always implicitly assigned; this stores extras.
   */
  const [assignments, setAssignmentsState] = useState<Record<string, string[]>>(() =>
    lsGet<Record<string, string[]>>(KEY_ASSIGNMENTS, {})
  );

  /** Non-null when a photo write was rejected (quota or size). Cleared on next successful write or reset. */
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Persist on change
  useEffect(() => { lsSet(KEY_SELECTION, selection); }, [selection]);
  useEffect(() => { lsSet(KEY_STATS, stats); }, [stats]);
  useEffect(() => { lsSet(KEY_VISIBILITY, visibility); }, [visibility]);
  useEffect(() => { lsSet(KEY_CAL_FILTER, calFilter); }, [calFilter]);
  useEffect(() => { lsSet(KEY_SCHED_VIEW, schedView); }, [schedView]);
  useEffect(() => { lsSet(KEY_MEDIA, mediaItems); }, [mediaItems]);
  useEffect(() => { lsSet(KEY_ASSIGNMENTS, assignments); }, [assignments]);
  // Photos are persisted inline in setPhoto (not via useEffect) so we can
  // surface quota errors synchronously.

  // ── Selection setters ──────────────────────────────────────────────────────

  const setClub = useCallback((clubId: string) => {
    setSelectionState(s => ({ ...s, clubId, programId: '', ageGroup: '', teamId: '', playerId: '' }));
  }, []);

  const setProgram = useCallback((programId: string) => {
    setSelectionState(s => ({ ...s, programId, ageGroup: '', teamId: '', playerId: '' }));
  }, []);

  const setAgeGroup = useCallback((ageGroup: string) => {
    setSelectionState(s => ({ ...s, ageGroup, teamId: '', playerId: '' }));
  }, []);

  const setTeam = useCallback((teamId: string) => {
    setSelectionState(s => ({ ...s, teamId, playerId: '' }));
  }, []);

  const setPlayer = useCallback((playerId: string) => {
    setSelectionState(s => ({ ...s, playerId }));
  }, []);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const statKey = (playerId: string, eventId: string) => `${playerId}:${eventId}`;

  const getStat = useCallback((playerId: string, eventId: string): DemoStatEntry | null => {
    return stats[statKey(playerId, eventId)] ?? null;
  }, [stats]);

  const setStat = useCallback((playerId: string, eventId: string, entry: DemoStatEntry) => {
    setStatsState(prev => ({ ...prev, [statKey(playerId, eventId)]: entry }));
  }, []);

  // ── Visibility ─────────────────────────────────────────────────────────────

  const isEventVisible = useCallback((eventId: string): boolean => {
    return visibility[eventId] !== false;
  }, [visibility]);

  const toggleEventVisibility = useCallback((eventId: string) => {
    setVisibilityState(prev => ({ ...prev, [eventId]: !(prev[eventId] !== false) }));
  }, []);

  // ── Calendar filter ────────────────────────────────────────────────────────

  const setCalFilter = useCallback((f: CalFilter) => {
    setCalFilterState(f);
  }, []);

  // ── Schedule view ──────────────────────────────────────────────────────────

  const setSchedView = useCallback((v: SchedView) => {
    setSchedViewState(v);
  }, []);

  // ── Photos ─────────────────────────────────────────────────────────────────

  const getPhoto = useCallback((playerId: string): string | null => {
    return photos[playerId] ?? null;
  }, [photos]);

  /**
   * Store a photo for a player.
   * dataUrl must be a base64 data-URL produced by FileReader.readAsDataURL.
   * Returns 'ok' | 'too-large' | 'quota'.
   */
  const setPhoto = useCallback((playerId: string, dataUrl: string): 'ok' | 'too-large' | 'quota' => {
    if (dataUrl.length > MAX_PHOTO_BYTES) {
      setPhotoError('Photo is too large (max ~150 KB). Please choose a smaller image.');
      return 'too-large';
    }
    const next = { ...photos, [playerId]: dataUrl };
    const result = lsSet(KEY_PHOTOS, next);
    if (result === 'quota') {
      setPhotoError('Storage is full. Clear some photos or reset the demo to free space.');
      return 'quota';
    }
    setPhotosState(next);
    setPhotoError(null);
    return 'ok';
  }, [photos]);

  const clearPhoto = useCallback((playerId: string) => {
    setPhotosState(prev => {
      const next = { ...prev };
      delete next[playerId];
      lsSet(KEY_PHOTOS, next);
      return next;
    });
    setPhotoError(null);
  }, []);

  const clearPhotoError = useCallback(() => setPhotoError(null), []);

  // ── Media items ────────────────────────────────────────────────────────────

  const addMediaItem = useCallback((item: DemoMediaItem) => {
    setMediaItemsState(prev => [item, ...prev]);
  }, []);

  const removeMediaItem = useCallback((id: string) => {
    setMediaItemsState(prev => prev.filter(m => m.id !== id));
    // Also remove any extra assignments for this item
    setAssignmentsState(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // ── Assignments ────────────────────────────────────────────────────────────

  /**
   * Returns all playerIds that have this item assigned (including the owner).
   */
  const getAssignedPlayers = useCallback((itemId: string, ownerPlayerId: string): string[] => {
    const extras = assignments[itemId] ?? [];
    return [ownerPlayerId, ...extras.filter(id => id !== ownerPlayerId)];
  }, [assignments]);

  /**
   * Assign an item to an additional player (does not duplicate the blob).
   */
  const assignItemToPlayer = useCallback((itemId: string, playerId: string) => {
    setAssignmentsState(prev => {
      const current = prev[itemId] ?? [];
      if (current.includes(playerId)) return prev;
      return { ...prev, [itemId]: [...current, playerId] };
    });
  }, []);

  /**
   * Remove an extra assignment. Does NOT delete the original item.
   */
  const unassignItemFromPlayer = useCallback((itemId: string, playerId: string) => {
    setAssignmentsState(prev => {
      const current = prev[itemId] ?? [];
      const next = current.filter(id => id !== playerId);
      if (next.length === 0) {
        const { [itemId]: _removed, ...rest } = prev;
        void _removed;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  }, []);

  // ── Tryout saves ───────────────────────────────────────────────────────────

  const [tryoutSaved, setTryoutSavedState] = useState<TryoutSavedMap>(() =>
    lsGet<TryoutSavedMap>(KEY_TRYOUT_SAVED, {})
  );

  const [tryoutCal, setTryoutCalState] = useState<TryoutCalSet>(() =>
    lsGet<TryoutCalSet>(KEY_TRYOUT_CAL, [])
  );

  useEffect(() => { lsSet(KEY_TRYOUT_SAVED, tryoutSaved); }, [tryoutSaved]);
  useEffect(() => { lsSet(KEY_TRYOUT_CAL, tryoutCal); }, [tryoutCal]);

  const saveTryout = useCallback((eventId: number, status: 'interested' | 'registered') => {
    setTryoutSavedState(prev => ({ ...prev, [eventId]: status }));
  }, []);

  const unsaveTryout = useCallback((eventId: number) => {
    setTryoutSavedState(prev => {
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
  }, []);

  const addTryoutToCalendar = useCallback((eventId: number) => {
    setTryoutCalState(prev => prev.includes(eventId) ? prev : [...prev, eventId]);
  }, []);

  const removeTryoutFromCalendar = useCallback((eventId: number) => {
    setTryoutCalState(prev => prev.filter(id => id !== eventId));
  }, []);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    try {
      DEMO_KEYS.forEach(k => localStorage.removeItem(k));
      // Also clear the outreach draft key
      localStorage.removeItem('sc_demo_pp_outreach_draft');
    } catch { /* ignore */ }
    // Clear IndexedDB blobs and collections
    idbResetAll().catch(() => { /* ignore — best-effort */ });
    setSelectionState({ clubId: '', programId: '', ageGroup: '', teamId: '', playerId: '' });
    setStatsState({});
    setVisibilityState({});
    setCalFilterState('all');
    setSchedViewState('list');
    setPhotosState({});
    setMediaItemsState([]);
    setAssignmentsState({});
    setPhotoError(null);
    setTryoutSavedState({});
    setTryoutCalState([]);
  }, []);

  return {
    selection,
    setClub, setProgram, setAgeGroup, setTeam, setPlayer,
    stats,
    getStat, setStat,
    visibility,
    isEventVisible, toggleEventVisibility,
    calFilter, setCalFilter,
    schedView, setSchedView,
    photos,
    getPhoto, setPhoto, clearPhoto,
    photoError, clearPhotoError,
    mediaItems,
    addMediaItem, removeMediaItem,
    assignments,
    getAssignedPlayers, assignItemToPlayer, unassignItemFromPlayer,
    tryoutSaved, tryoutCal,
    saveTryout, unsaveTryout,
    addTryoutToCalendar, removeTryoutFromCalendar,
    reset,
  };
}
