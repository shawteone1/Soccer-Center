/**
 * PlayMetrics Integration Pilot — In-memory demo store
 *
 * Stores pilot game records, player-team assignments, and connector state
 * in server memory for the duration of the process.
 *
 * IMPORTANT: This is NOT production database persistence.
 * Data resets on server restart. This is clearly communicated in the UI.
 *
 * Schema changes required for production persistence are documented in
 * src/server/pilot/SCHEMA_NOTES.md — not executed here.
 */

import type { PilotGameRecord, PilotPlayerAssignment, PilotConnectorState } from './types.js';
import { DEMO_CONNECTOR_STATE, DEMO_SEED_RECORDS, DEMO_FIXTURES } from './demoData.js';

// ─── In-memory stores ─────────────────────────────────────────────────────────

/** game records keyed by id */
const records = new Map<string, PilotGameRecord>();

/** player assignments keyed by playerId */
const assignments = new Map<string, PilotPlayerAssignment>();

/** connector state */
let connectorState: PilotConnectorState = { ...DEMO_CONNECTOR_STATE };

/** demo player id — set when demo is initialized */
let demoPilotPlayerId: string | null = null;

// ─── ID generation ────────────────────────────────────────────────────────────

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Connector state ──────────────────────────────────────────────────────────

export function getConnectorState(): PilotConnectorState {
  return { ...connectorState };
}

export function setConnectorState(state: Partial<PilotConnectorState>) {
  connectorState = { ...connectorState, ...state };
}

// ─── Player assignments ───────────────────────────────────────────────────────

export function getAssignment(playerId: string): PilotPlayerAssignment | null {
  return assignments.get(playerId) ?? null;
}

export function setAssignment(playerId: string, pilotTeamId: string, calendarSynced = false): PilotPlayerAssignment {
  const existing = assignments.get(playerId);
  const assignment: PilotPlayerAssignment = {
    playerId,
    pilotTeamId,
    assignedAt: existing?.assignedAt ?? new Date().toISOString(),
    calendarSynced,
  };
  assignments.set(playerId, assignment);
  return assignment;
}

export function removeAssignment(playerId: string) {
  assignments.delete(playerId);
}

// ─── Game records ─────────────────────────────────────────────────────────────

export function getRecordsForPlayer(playerId: string): PilotGameRecord[] {
  return Array.from(records.values())
    .filter(r => r.playerId === playerId)
    .sort((a, b) => {
      // Sort by fixture date descending
      const fa = DEMO_FIXTURES.find(f => f.id === a.fixtureId);
      const fb = DEMO_FIXTURES.find(f => f.id === b.fixtureId);
      return (fb?.date ?? '') > (fa?.date ?? '') ? 1 : -1;
    });
}

export function getRecord(id: string): PilotGameRecord | null {
  return records.get(id) ?? null;
}

export function upsertRecord(
  playerId: string,
  fixtureId: string,
  data: Omit<PilotGameRecord, 'id' | 'playerId' | 'fixtureId' | 'createdAt' | 'updatedAt'>,
  existingId?: string,
): PilotGameRecord {
  // Prevent duplicates: one record per player+fixture
  const existing = existingId
    ? records.get(existingId)
    : Array.from(records.values()).find(r => r.playerId === playerId && r.fixtureId === fixtureId);

  const now = new Date().toISOString();
  const record: PilotGameRecord = {
    id: existing?.id ?? newId('pgr'),
    playerId,
    fixtureId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...data,
  };
  records.set(record.id, record);
  return record;
}

export function deleteRecord(id: string): boolean {
  return records.delete(id);
}

// ─── Totals calculation ───────────────────────────────────────────────────────

export interface PilotTotals {
  gp: number;
  goals: number;
  assists: number;
  ga: number | null;
  saves: number | null;
  shutouts: number | null;
}

export function calcTotals(playerId: string): PilotTotals {
  const playerRecords = getRecordsForPlayer(playerId).filter(r => r.participated);
  return playerRecords.reduce<PilotTotals>(
    (acc, r) => ({
      gp:       acc.gp + 1,
      goals:    acc.goals + (r.goals ?? 0),
      assists:  acc.assists + (r.assists ?? 0),
      ga:       r.ga != null ? (acc.ga ?? 0) + r.ga : acc.ga,
      saves:    r.saves != null ? (acc.saves ?? 0) + r.saves : acc.saves,
      shutouts: r.shutouts != null ? (acc.shutouts ?? 0) + r.shutouts : acc.shutouts,
    }),
    { gp: 0, goals: 0, assists: 0, ga: null, saves: null, shutouts: null },
  );
}

// ─── Demo player management ───────────────────────────────────────────────────

export function getDemoPilotPlayerId(): string | null {
  return demoPilotPlayerId;
}

export function setDemoPilotPlayerId(id: string) {
  demoPilotPlayerId = id;
}

// ─── Reset demo ───────────────────────────────────────────────────────────────

export function resetDemo() {
  records.clear();
  assignments.clear();
  connectorState = { ...DEMO_CONNECTOR_STATE };
  demoPilotPlayerId = null;
}

// ─── Seed demo records for a player ──────────────────────────────────────────

export function seedDemoRecords(playerId: string) {
  // Idempotent — only seed if no records exist for this player
  const existing = getRecordsForPlayer(playerId);
  if (existing.length > 0) return;

  for (const seed of DEMO_SEED_RECORDS) {
    upsertRecord(playerId, seed.fixtureId, {
      participated: seed.participated,
      goals: seed.goals,
      assists: seed.assists,
      ga: seed.ga,
      saves: seed.saves,
      shutouts: seed.shutouts,
      notes: seed.notes,
    });
  }
}
