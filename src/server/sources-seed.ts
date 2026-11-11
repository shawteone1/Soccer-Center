/**
 * Shared upsert logic for the sc_sources catalog.
 *
 * Called by:
 *   - entry.ts startup auto-seed (every boot, idempotent)
 *   - POST /api/parent/admin/seed-sources (admin manual trigger)
 *
 * Uses MySQL INSERT ... ON DUPLICATE KEY UPDATE so the operation is
 * atomic — safe to call concurrently (two startup paths) and safe to
 * re-run at any time. Never changes sc_sources.id, so all
 * sc_user_following rows remain valid.
 */
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { SOURCES_CATALOG } from '@/server/sources-catalog.js';

export interface SeedResult {
  upserted: number;
  inserted: number;
  errors: number;
}

export async function upsertSourcesCatalog(): Promise<SeedResult> {
  let upserted = 0;
  let inserted = 0;
  let errors = 0;

  for (const src of SOURCES_CATALOG) {
    try {
      // Use INSERT ... ON DUPLICATE KEY UPDATE so the operation is atomic.
      // importKey has a UNIQUE constraint — duplicate key means the row exists,
      // so we update the feed-critical fields. id is never changed.
      const result = await db.execute(sql`
        INSERT INTO sc_sources
          (id, import_key, label, url, format, authority, scope,
           integration_status, feed_endpoint, connector_enabled, notes)
        VALUES
          (${randomUUID()}, ${src.importKey}, ${src.label}, ${src.url},
           ${src.format}, ${src.authority}, ${src.scope},
           ${src.integrationStatus}, ${src.feedEndpoint},
           ${src.connectorEnabled}, ${src.notes})
        ON DUPLICATE KEY UPDATE
          label              = VALUES(label),
          url                = VALUES(url),
          format             = VALUES(format),
          authority          = VALUES(authority),
          scope              = VALUES(scope),
          integration_status = VALUES(integration_status),
          feed_endpoint      = VALUES(feed_endpoint),
          connector_enabled  = VALUES(connector_enabled),
          notes              = VALUES(notes)
      `);

      // db.execute() for DML returns [OkPacket, FieldPacket[]] — unwrap directly.
      // MySQL affected_rows: 1 = inserted, 2 = updated, 0 = no change (identical row)
      const [okPacket] = result as [{ affectedRows?: number }, unknown];
      const affected = okPacket?.affectedRows ?? 1;
      if (affected === 1) inserted++;
      else upserted++;
    } catch (err) {
      console.error(`[sources-seed] error upserting ${src.importKey}:`, err);
      errors++;
    }
  }

  return { upserted, inserted, errors };
}
