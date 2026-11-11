/**
 * src/server/lib/coach-feature-gate.ts
 *
 * Single source of truth for the COACH_PROFILE_LINKS_ENABLED feature gate.
 *
 * Enabled only when the secret's trimmed, lowercase value is exactly 'true'.
 * Any other value — including a non-empty URL, a partial key name, or whitespace —
 * is treated as disabled. This restores the strict gate after the temporary
 * workaround that accepted any non-empty string.
 *
 * All coach-sharing endpoints and the startup migration MUST import this
 * helper instead of inlining the check.
 */

import { getSecret } from '#airo/secrets';

/**
 * Returns true only when COACH_PROFILE_LINKS_ENABLED is set to the
 * four-character string 'true' (case-insensitive, whitespace-trimmed).
 */
export function isCoachProfileEnabled(): boolean {
  const raw = getSecret('COACH_PROFILE_LINKS_ENABLED');
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'true';
}
