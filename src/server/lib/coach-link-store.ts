/**
 * src/server/lib/coach-link-store.ts
 *
 * Coach profile link persistence layer.
 *
 * STORE SELECTION POLICY
 * ──────────────────────
 * Production routes MUST use a durable store. The InMemoryCoachLinkStore is
 * restricted to two contexts:
 *
 *   1. Automated tests — inject via setCoachLinkStore() in test setup.
 *   2. Explicit synthetic demo mode — COACH_PROFILE_DEMO_MODE=true secret.
 *      Demo mode is for UI preview only; links do not survive restarts.
 *
 * getCoachLinkStore() returns null when neither condition is met and no durable
 * store has been registered. Callers MUST check for null and return 503 when
 * the store is unavailable — a feature flag alone does not activate sharing.
 *
 * DURABLE STORE (DrizzleCoachLinkStore)
 * ──────────────────────────────────────
 * DrizzleCoachLinkStore is implemented below but NOT connected to the database.
 * It will throw STORE_NOT_CONNECTED on every operation until:
 *   1. Database isolation between preview and production is confirmed.
 *   2. The run-schema-coach-profile-v1 migration has been executed.
 *   3. setCoachLinkStore(new DrizzleCoachLinkStore(db)) is called at startup.
 *
 * TOKEN SECURITY
 * ──────────────
 * Raw tokens: 32 random bytes (256 bits), base64url-encoded.
 * Only the SHA-256 hex hash is stored — the raw token is never persisted.
 * The coach view URL is /coach/profile/:rawToken.
 */

import { createHash, randomBytes } from 'node:crypto';

// ── Token utilities ───────────────────────────────────────────────────────────

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

function generateId(): string {
  return randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
}

// ── Record and input types ────────────────────────────────────────────────────

export interface CoachLinkRecord {
  id: string;
  playerId: string;
  userId: string;
  tokenHash: string;
  approvedFields: string[];
  selectedMatchRecords: string[];
  selectedMedia: string[];
  /** sc_parent_manual_events.id values the parent chose to share. Empty = share all upcoming games. */
  selectedEvents: string[];
  selectedCollectionId: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  label: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * True when this link was created in demo mode (InMemoryCoachLinkStore, COACH_PROFILE_DEMO_MODE=true).
   * The coach view GET serves synthetic fixtures for demo links instead of querying the real DB.
   * This prevents demo tokens from being used to probe real player data.
   */
  demoMode: boolean;
}

export interface CreateLinkInput {
  playerId: string;
  userId: string;
  approvedFields: string[];
  selectedMatchRecords: string[];
  selectedMedia?: string[];
  /** sc_parent_manual_events.id values the parent chose to share. Omit or pass [] to share all upcoming games. */
  selectedEvents?: string[];
  selectedCollectionId?: string | null;
  /**
   * Expiry in days from now.
   * Must be 1–365 (inclusive). No never-expiring links in v1.
   * Default: 30.
   */
  expiresInDays: number;
  label?: string | null;
}

export interface CoachLinkStore {
  create(input: CreateLinkInput): Promise<{ record: CoachLinkRecord; rawToken: string }>;
  listForPlayer(playerId: string, userId: string): Promise<CoachLinkRecord[]>;
  revoke(id: string, userId: string): Promise<boolean>;
  findByToken(rawToken: string): Promise<CoachLinkRecord | null>;
}

// ── In-memory implementation (tests + demo mode only) ────────────────────────

/**
 * InMemoryCoachLinkStore — process-local, non-durable.
 *
 * RESTRICTED USE:
 *   - Automated tests (inject via setCoachLinkStore in test setup)
 *   - COACH_PROFILE_DEMO_MODE=true (UI preview only, no persistence)
 *
 * NEVER register this as the production store. Links do not survive restarts.
 */
export class InMemoryCoachLinkStore implements CoachLinkStore {
  private records = new Map<string, CoachLinkRecord>();
  private tokenIndex = new Map<string, string>(); // tokenHash -> id
  /** When true, links created by this store are marked demoMode=true */
  readonly _isDemoMode: boolean;

  constructor(isDemoMode = false) {
    this._isDemoMode = isDemoMode;
  }

  async create(input: CreateLinkInput): Promise<{ record: CoachLinkRecord; rawToken: string }> {
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const id = generateId();

    const expiresAt = new Date(now.getTime() + input.expiresInDays * 86_400_000);

    const record: CoachLinkRecord = {
      id,
      playerId: input.playerId,
      userId: input.userId,
      tokenHash,
      approvedFields: input.approvedFields,
      selectedMatchRecords: input.selectedMatchRecords,
      selectedMedia: input.selectedMedia ?? [],
      selectedEvents: input.selectedEvents ?? [],
      selectedCollectionId: input.selectedCollectionId ?? null,
      expiresAt,
      revokedAt: null,
      label: input.label ?? null,
      createdAt: now,
      updatedAt: now,
      demoMode: this._isDemoMode,
    };

    this.records.set(id, record);
    this.tokenIndex.set(tokenHash, id);
    return { record, rawToken };
  }

  async listForPlayer(playerId: string, userId: string): Promise<CoachLinkRecord[]> {
    return Array.from(this.records.values())
      .filter(r => r.playerId === playerId && r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record || record.userId !== userId) return false;
    if (record.revokedAt != null) return false;
    record.revokedAt = new Date();
    record.updatedAt = new Date();
    return true;
  }

  async findByToken(rawToken: string): Promise<CoachLinkRecord | null> {
    const tokenHash = hashToken(rawToken);
    const id = this.tokenIndex.get(tokenHash);
    if (!id) return null;
    return this.records.get(id) ?? null;
  }

  /** Test helper: clear all records */
  clear(): void {
    this.records.clear();
    this.tokenIndex.clear();
  }
}

// ── Drizzle implementation (disconnected — not registered at startup) ────────

/**
 * DrizzleCoachLinkStore — durable, database-backed.
 *
 * IMPLEMENTATION STATUS: Complete. NOT connected to the database.
 *
 * All four methods are fully implemented against the sc_coach_profile_links
 * schema. The store is NOT registered at server startup until:
 *   1. Database isolation between preview and production is confirmed.
 *   2. The run-schema-coach-profile-v1 migration has been executed.
 *   3. setCoachLinkStore(new DrizzleCoachLinkStore(db)) is called in entry.ts.
 *
 * Until then, getCoachLinkStore() returns null (or the demo InMemoryStore)
 * and all coach-link routes return 503 STORE_UNAVAILABLE.
 *
 * TOKEN SECURITY: Only the SHA-256 hash is stored. The raw token is never
 * written to the database, never logged, and never returned after creation.
 *
 * DEMO MODE: demoMode is always false for Drizzle records — the DB has no
 * demoMode column. Only InMemoryCoachLinkStore creates demo-mode links.
 */
export class DrizzleCoachLinkStore implements CoachLinkStore {
  private _db: typeof import('@/server/db/client.js').db | null;

  constructor(dbInstance?: typeof import('@/server/db/client.js').db) {
    this._db = dbInstance ?? null;
  }

  private get db(): typeof import('@/server/db/client.js').db {
    if (!this._db) {
      const err = new Error(
        'DrizzleCoachLinkStore: database not connected. ' +
        'Confirm isolation and run run-schema-coach-profile-v1 before activating.',
      );
      (err as NodeJS.ErrnoException).code = 'STORE_NOT_CONNECTED';
      throw err;
    }
    return this._db;
  }

  async create(input: CreateLinkInput): Promise<{ record: CoachLinkRecord; rawToken: string }> {
    const { eq: drizzleEq } = await import('drizzle-orm');
    const { scCoachProfileLinks } = await import('@/server/db/schema.js');

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const id = generateId();
    const expiresAt = new Date(now.getTime() + input.expiresInDays * 86_400_000);

    await this.db.insert(scCoachProfileLinks).values({
      id,
      playerId: input.playerId,
      userId: input.userId,
      tokenHash,
      approvedFields: JSON.stringify(input.approvedFields),
      selectedMedia: JSON.stringify(input.selectedMedia ?? []),
      selectedMatchRecords: JSON.stringify(input.selectedMatchRecords),
      selectedEvents: JSON.stringify(input.selectedEvents ?? []),
      selectedCollectionId: input.selectedCollectionId ?? null,
      expiresAt,
      revokedAt: null,
      label: input.label ?? null,
    });

    // Re-fetch to get DB-generated timestamps
    const rows = await this.db
      .select()
      .from(scCoachProfileLinks)
      .where(drizzleEq(scCoachProfileLinks.id, id))
      .limit(1);

    if (rows.length === 0) throw new Error('DrizzleCoachLinkStore: insert succeeded but re-fetch returned no rows');

    const record = this._rowToRecord(rows[0]);
    return { record, rawToken };
  }

  async listForPlayer(playerId: string, userId: string): Promise<CoachLinkRecord[]> {
    const { and, eq: drizzleEq, desc } = await import('drizzle-orm');
    const { scCoachProfileLinks } = await import('@/server/db/schema.js');

    const rows = await this.db
      .select()
      .from(scCoachProfileLinks)
      .where(
        and(
          drizzleEq(scCoachProfileLinks.playerId, playerId),
          drizzleEq(scCoachProfileLinks.userId, userId),
        ),
      )
      .orderBy(desc(scCoachProfileLinks.createdAt));

    return rows.map(r => this._rowToRecord(r));
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    const { and, eq: drizzleEq, isNull } = await import('drizzle-orm');
    const { scCoachProfileLinks } = await import('@/server/db/schema.js');

    // Only revoke if the link belongs to this user and is not already revoked
    const rows = await this.db
      .select({ id: scCoachProfileLinks.id })
      .from(scCoachProfileLinks)
      .where(
        and(
          drizzleEq(scCoachProfileLinks.id, id),
          drizzleEq(scCoachProfileLinks.userId, userId),
          isNull(scCoachProfileLinks.revokedAt),
        ),
      )
      .limit(1);

    if (rows.length === 0) return false;

    await this.db
      .update(scCoachProfileLinks)
      .set({ revokedAt: new Date() })
      .where(drizzleEq(scCoachProfileLinks.id, id));

    return true;
  }

  async findByToken(rawToken: string): Promise<CoachLinkRecord | null> {
    const { eq: drizzleEq } = await import('drizzle-orm');
    const { scCoachProfileLinks } = await import('@/server/db/schema.js');

    const tokenHash = hashToken(rawToken);
    const rows = await this.db
      .select()
      .from(scCoachProfileLinks)
      .where(drizzleEq(scCoachProfileLinks.tokenHash, tokenHash))
      .limit(1);

    if (rows.length === 0) return null;
    return this._rowToRecord(rows[0]);
  }

  private _rowToRecord(row: Record<string, unknown>): CoachLinkRecord {
    return {
      id:                   row.id as string,
      playerId:             row.playerId as string,
      userId:               row.userId as string,
      tokenHash:            row.tokenHash as string,
      approvedFields:       this._parseJson(row.approvedFields as string, []),
      selectedMatchRecords: this._parseJson(row.selectedMatchRecords as string, []),
      selectedMedia:        this._parseJson(row.selectedMedia as string, []),
      selectedEvents:       this._parseJson(row.selectedEvents as string, []),
      selectedCollectionId: (row.selectedCollectionId as string | null) ?? null,
      expiresAt:            row.expiresAt instanceof Date ? row.expiresAt : (row.expiresAt ? new Date(row.expiresAt as string) : null),
      revokedAt:            row.revokedAt instanceof Date ? row.revokedAt : (row.revokedAt ? new Date(row.revokedAt as string) : null),
      label:                (row.label as string | null) ?? null,
      createdAt:            row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as string),
      updatedAt:            row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt as string),
      // DB records are never demo-mode — only InMemoryCoachLinkStore creates demo links
      demoMode:             false,
    };
  }

  private _parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
}

// ── Singleton store ───────────────────────────────────────────────────────────

/**
 * The active store instance.
 *
 * null = no store registered (production default until durable store is ready).
 * InMemoryCoachLinkStore = tests or demo mode only.
 * DrizzleCoachLinkStore = production (not yet connected).
 */
let _store: CoachLinkStore | null = null;

/**
 * Returns the active store, or null if no durable store is available.
 *
 * In demo mode (COACH_PROFILE_DEMO_MODE=true), returns a process-local
 * InMemoryCoachLinkStore. Links created in demo mode do not survive restarts.
 *
 * Callers MUST handle null by returning 503 — a feature flag alone does not
 * activate sharing.
 */
export function getCoachLinkStore(
  getSecretFn: (key: string) => string | undefined,
): CoachLinkStore | null {
  if (_store !== null) return _store;

  // Demo mode: process-local in-memory store for UI preview
  // Links created in demo mode are marked demoMode=true so the coach view
  // GET serves synthetic fixtures instead of querying the real database.
  if (getSecretFn('COACH_PROFILE_DEMO_MODE') === 'true') {
    const demoStore = new InMemoryCoachLinkStore(/* isDemoMode= */ true);
    _store = demoStore;
    return demoStore;
  }

  // No durable store registered — fail closed
  return null;
}

/**
 * Replace the store implementation.
 *
 * For tests: inject an InMemoryCoachLinkStore.
 * For production: inject a DrizzleCoachLinkStore once isolation is confirmed.
 * Pass null to reset to the fail-closed default.
 */
export function setCoachLinkStore(store: CoachLinkStore | null): void {
  _store = store;
}
