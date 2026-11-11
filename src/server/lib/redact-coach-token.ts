/**
 * src/server/lib/redact-coach-token.ts
 *
 * Redact the raw bearer token from coach profile URLs before logging.
 * Extracted from entry.ts so it can be imported by both the server
 * and the test suite — the test verifies the actual implementation,
 * not a copied function.
 *
 * /coach/profile/<token>[?...] -> /coach/profile/[REDACTED][?...]
 * All other URLs are returned unchanged.
 */
export function redactCoachToken(url: string): string {
  return url.replace(/(\/coach\/(?:profile|photo|media)\/)[^/?#]+/g, '$1[REDACTED]');
}
