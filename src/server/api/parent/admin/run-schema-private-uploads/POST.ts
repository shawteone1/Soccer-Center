/**
 * POST /api/parent/admin/run-schema-private-uploads
 *
 * Idempotent schema migration for the private-uploads activation package.
 *
 * Changes applied (all additive, all guarded with IF NOT EXISTS / column checks):
 *   sc_player_profiles.avatar_url  — already exists (VARCHAR 1024); no change needed.
 *   sc_parent_media.storage_path   — already exists; no change needed.
 *   sc_parent_media.mime_type      — add if absent (VARCHAR 128).
 *   sc_parent_media.size_bytes     — add if absent (BIGINT).
 *   sc_parent_media.original_name  — add if absent (VARCHAR 255).
 *
 * This migration is safe to run multiple times. It does NOT move any files.
 * File migration is handled by POST /api/parent/admin/migrate-to-private.
 *
 * Protected: admin only.
 */

import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

interface ColumnCheckRow { column_name: string }

async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = DATABASE()
            AND table_name   = ${table}
            AND column_name  = ${column}
          LIMIT 1`
    ) as unknown;
    const rows = (result as [ColumnCheckRow[]])[0];
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function tableExists(table: string): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = DATABASE()
            AND table_name   = ${table}
          LIMIT 1`
    ) as unknown;
    const rows = (result as [{ table_name: string }[]])[0];
    return rows.length > 0;
  } catch {
    return false;
  }
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const applied: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // ── sc_parent_media columns ───────────────────────────────────────────────────

  const mediaTableExists = await tableExists('sc_parent_media');
  if (!mediaTableExists) {
    errors.push('sc_parent_media table does not exist — run run-schema-player-media first');
    res.status(422).json({ ok: false, applied, skipped, errors });
    return;
  }

  // mime_type
  if (!(await columnExists('sc_parent_media', 'mime_type'))) {
    try {
      await db.execute(sql`ALTER TABLE sc_parent_media ADD COLUMN mime_type VARCHAR(128) NULL`);
      applied.push('sc_parent_media.mime_type');
    } catch (e) {
      errors.push(`sc_parent_media.mime_type: ${String(e)}`);
    }
  } else {
    skipped.push('sc_parent_media.mime_type');
  }

  // size_bytes
  if (!(await columnExists('sc_parent_media', 'size_bytes'))) {
    try {
      await db.execute(sql`ALTER TABLE sc_parent_media ADD COLUMN size_bytes BIGINT NULL`);
      applied.push('sc_parent_media.size_bytes');
    } catch (e) {
      errors.push(`sc_parent_media.size_bytes: ${String(e)}`);
    }
  } else {
    skipped.push('sc_parent_media.size_bytes');
  }

  // original_name
  if (!(await columnExists('sc_parent_media', 'original_name'))) {
    try {
      await db.execute(sql`ALTER TABLE sc_parent_media ADD COLUMN original_name VARCHAR(255) NULL`);
      applied.push('sc_parent_media.original_name');
    } catch (e) {
      errors.push(`sc_parent_media.original_name: ${String(e)}`);
    }
  } else {
    skipped.push('sc_parent_media.original_name');
  }

  const ok = errors.length === 0;
  res.status(ok ? 200 : 207).json({ ok, applied, skipped, errors });
}
