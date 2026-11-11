import type { Request, Response } from "express";
import { getSecret } from "#airo/secrets";
import { requireParentAccess } from "@/server/auth-policy.js";
import { isCoachProfileEnabled } from "@/server/lib/coach-feature-gate.js";
import { OutreachError } from "./bulk-outreach-delivery";
export function secret(name: string): string {
  const v = getSecret(name);
  return typeof v === "string" ? v.trim() : "";
}
function allowed(list: string, email: string) {
  return (
    list === "*" ||
    list
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.toLowerCase())
  );
}
export function senderConfig() {
  const apiKey = secret("BULK_OUTREACH_RESEND_API_KEY");
  const from = secret("BULK_OUTREACH_FROM");
  const base = secret("BETTER_AUTH_URL");
  let origin = "";
  try {
    const u = new URL(base);
    if (u.protocol === "https:" && !u.username && !u.password)
      origin = u.origin;
  } catch {
    /* disabled */
  }
  if (!apiKey || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from) || !origin)
    throw new OutreachError(
      503,
      "Bulk email sender is not configured. An admin must configure the verified sending address, provider key and HTTPS site URL.",
    );
  return { apiKey, from, origin };
}
export async function bulkAccess(req: Request, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  const user = await requireParentAccess(req, res);
  if (!user) return null;
  if (
    !isCoachProfileEnabled() ||
    secret("BULK_OUTREACH_ENABLED") !== "true" ||
    secret("COACH_PROFILE_DEMO_MODE") === "true" ||
    !allowed(secret("COACH_PROFILE_TESTERS"), user.email) ||
    !allowed(secret("BULK_OUTREACH_TESTERS"), user.email)
  ) {
    res
      .status(403)
      .json({
        error:
          "Bulk outreach is not enabled for this account. Existing profile sharing remains available.",
      });
    return null;
  }
  return user;
}
export function outreachFailure(res: Response, error: unknown) {
  // Do not serialize or log errors: database/provider failures may contain tokens or PII.
  res.status(error instanceof OutreachError ? error.status : 503).json({
    error:
      error instanceof OutreachError
        ? error.message
        : "Outreach storage is unavailable. Check delivery history before retrying. An admin may need to apply the bulk outreach migration.",
  });
}
