/** Session-bound, single-use calendar consent. Uses the existing auth verification table. */
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/server/db/client.js";
import { verification } from "@/server/db/schema.js";
import { getSecret } from "#airo/secrets";
export type CalendarProvider = "google" | "outlook";
interface Consent {
  userId: string;
  provider: CalendarProvider;
  redirectUri: string;
  verifier: string;
}
const identifier = (state: string) =>
  `sc-calendar-consent:${createHash("sha256").update(state).digest("hex")}`;
export function calendarRedirectUri(provider: CalendarProvider): string {
  const configured =
    getSecret("CALENDAR_OAUTH_BASE_URL") ||
    getSecret("BETTER_AUTH_URL") ||
    "https://soccercenter.org";
  const url = new URL(String(configured));
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Calendar OAuth origin must be HTTPS");
  return `${url.origin}/api/calendar/${provider}/callback`;
}
export async function createCalendarConsent(
  userId: string,
  provider: CalendarProvider,
) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const redirectUri = calendarRedirectUri(provider);
  const value: Consent = { userId, provider, redirectUri, verifier };
  await db
    .insert(verification)
    .values({
      id: randomUUID(),
      identifier: identifier(state),
      value: JSON.stringify(value),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
  return {
    state,
    redirectUri,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}
export async function consumeCalendarConsent(
  state: unknown,
  userId: string,
  provider: CalendarProvider,
): Promise<Consent | null> {
  if (typeof state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(state))
    return null;
  const [row] = await db
    .select()
    .from(verification)
    .where(
      and(
        eq(verification.identifier, identifier(state)),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;
  let consent: Consent;
  try {
    consent = JSON.parse(row.value) as Consent;
  } catch {
    return null;
  }
  if (
    consent.userId !== userId ||
    consent.provider !== provider ||
    typeof consent.verifier !== "string" ||
    consent.redirectUri !== calendarRedirectUri(provider)
  )
    return null;
  // A conditional delete elects a single winner, including across server instances.
  const [result] = await db
    .delete(verification)
    .where(
      and(
        eq(verification.id, row.id),
        eq(verification.value, row.value),
        gt(verification.expiresAt, new Date()),
      ),
    );
  return result.affectedRows === 1 ? consent : null;
}
