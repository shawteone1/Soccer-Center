import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { parseUkEducation } from '@/lib/portal/uk-education';

// Call only after player ownership or coach-link authorization has succeeded.
export async function readUkEducation(playerId: string) {
  try {
    const result = await db.execute(sql`SELECT uk_education FROM sc_player_profiles WHERE id = ${playerId} LIMIT 1`);
    const [rows] = result as unknown as [Array<{ uk_education: unknown }>, unknown];
    return parseUkEducation(rows[0]?.uk_education);
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_BAD_FIELD_ERROR' || (error as { cause?: { code?: string } }).cause?.code === 'ER_BAD_FIELD_ERROR') return null;
    throw error;
  }
}
