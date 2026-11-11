/**
 * src/lib/demo/secrets-adapter.ts
 *
 * Local no-op adapter for the #airo/secrets platform module.
 *
 * Used by the isolated demo build (vite.demo.ts) via a Vite resolve alias
 * so that any module importing getSecret from '#airo/secrets' resolves here
 * instead of the platform-managed module.
 *
 * BEHAVIOUR
 * ─────────
 * Returns undefined for every key. Callers that need a value at runtime must
 * handle undefined. No credentials, no platform config, no production logic.
 *
 * ISOLATION
 * ─────────
 * This file is safe to include in source exports. It contains no secrets.
 */

export function getSecret(_name: string): string | undefined {
  return undefined;
}
