import { z } from "zod";

export const MAX_COACHES = 20;
export const MAX_PLAYERS = 5;
const singleLine = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((v) => !/[\r\n]/.test(v));
export const bulkMessageSchema = z
  .object({
    batchId: z.string().uuid(),
    messageId: z.string().uuid(),
    consent: z.literal(true),
    coachId: z.string().min(1).max(128),
    recipientEmail: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    coachName: singleLine,
    institution: singleLine,
    subject: singleLine,
    introduction: z.string().trim().min(1).max(2000),
    profiles: z
      .array(
        z
          .object({
            playerId: z.string().min(1).max(128),
            linkId: z.string().min(1).max(128),
            url: z.string().url().max(2048),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_PLAYERS),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.profiles.map((p) => p.playerId)).size !== v.profiles.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate player",
      });
    if (/\/coach\/profile\//i.test(v.introduction + v.subject))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Use selected profile links, not links pasted into the message",
      });
  });
export type BulkMessage = z.infer<typeof bulkMessageSchema>;
export type DeliveryState = "sending" | "accepted" | "failed" | "unknown";
export interface DeliveryReceipt {
  messageId: string;
  state: DeliveryState;
  retryable: boolean;
  retryAfterSeconds?: number;
}
export function personalize(
  template: string,
  coach: { name: string; institution: string },
): string {
  return template.replace(/\{\{(coach|college)\}\}/g, (_, key: string) =>
    key === "coach" ? coach.name : coach.institution,
  );
}
/** Links only: academic results and private records are never copied into email. */
export function outreachEmailText(message: BulkMessage): string {
  return `Dear ${message.coachName},\n\n${message.introduction}\n\n${message.profiles.map((p, i) => `Player profile ${i + 1}:\n${p.url}`).join("\n\n")}\n\nThese links show only parent-approved information and may expire or be revoked.\n\nThank you for your time and consideration.`;
}
export function coachToken(raw: string, origin: string): string | null {
  try {
    const url = new URL(raw);
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return (
      /^\/coach\/profile\/([A-Za-z0-9_-]{43})$/.exec(url.pathname)?.[1] ?? null
    );
  } catch {
    return null;
  }
}
