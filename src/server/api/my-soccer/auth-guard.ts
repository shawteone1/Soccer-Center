/**
 * auth-guard.ts
 *
 * Shared helper for /api/my-soccer/* routes.
 * Validates the BetterAuth session cookie and returns the authenticated userId,
 * or sends a 401 and returns null so the caller can return immediately.
 *
 * Never returns the session token or any credential to the caller.
 */

import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth';
import { toWebRequest } from '@/lib/auth/express-adapter';
import { db } from '@/server/db/client.js';
import { user as userTable } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null | undefined;
  isAdmin: boolean;
  /**
   * Server-managed account type. Null for legacy accounts not yet migrated.
   * Treat null as 'FAN' (least privilege) at every authorization check.
   */
  accessType: string | null;
}

/** Returns the full user record (with isAdmin + accessType) or null — does NOT send a response. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: toWebRequest(req).headers });
    if (!session?.user?.id) return null;
    const [row] = await db.select({
      id: userTable.id,
      email: userTable.email,
      name: userTable.name,
      isAdmin: userTable.isAdmin,
      accessType: userTable.accessType,
    }).from(userTable).where(eq(userTable.id, session.user.id)).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      isAdmin: row.isAdmin ?? false,
      accessType: row.accessType ?? null,
    };
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response): Promise<string | null> {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: toWebRequest(req).headers });
    if (!session?.user?.id) {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    }
    return session.user.id;
  } catch {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
}
