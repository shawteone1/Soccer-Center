import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
export const digest = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export const opaque = () => randomBytes(32).toString("base64url");
export function passwordHash(password: string) {
  if (password.length < 12) throw new Error("PASSWORD_MINIMUM_12");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function passwordMatches(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  const expected = Buffer.from(key, "hex");
  return timingSafeEqual(scryptSync(password, salt, 64), expected);
}
export function encryption(key: Buffer | undefined) {
  const requireKey = () => {
    if (!key || key.length !== 32) throw new Error("ENCRYPTION_KEY_REQUIRED");
    return key;
  };
  return {
    seal(value: unknown, aad: string) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", requireKey(), iv);
      cipher.setAAD(Buffer.from(aad));
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(value)),
        cipher.final(),
      ]);
      return JSON.stringify({
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: encrypted.toString("base64"),
      });
    },
    open(value: string, aad: string) {
      const data = JSON.parse(value),
        decipher = createDecipheriv(
          "aes-256-gcm",
          requireKey(),
          Buffer.from(data.iv, "base64"),
        );
      decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(Buffer.from(data.tag, "base64"));
      return JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(data.data, "base64")),
          decipher.final(),
        ]).toString(),
      );
    },
  };
}
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /token|secret|password|authorization|api.?key|cookie|verifier|code/i.test(
          k,
        )
          ? "[REDACTED]"
          : redact(v),
      ]),
    );
  if (typeof value === "string")
    return value
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(/([?&](?:code|state|access_token)=)[^&\s]+/gi, "$1[REDACTED]");
  return value;
}
export function rejectSensitive(text: string) {
  if (
    /Bearer\s+\S+|(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|client[_ -]?secret)\s*[:=]/i.test(
      text,
    )
  )
    throw new Error("SENSITIVE_INPUT_REJECTED");
}
