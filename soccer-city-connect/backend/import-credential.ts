// Host-admin CLI only. Imports an already-authorized Mindbody public-sandbox credential file.
import { readFileSync } from "node:fs";
import { developmentPath } from "./config";
import { z } from "zod";
import { PilotDatabase } from "./database";
const keyPath = process.env.SCC_MASTER_KEY_FILE,
  inputPath = process.env.SCC_CREDENTIAL_FILE,
  org = process.env.SCC_CREDENTIAL_ORG;
if (!keyPath || !inputPath || !org)
  throw new Error("KEY_FILE_CREDENTIAL_FILE_ORGANIZATION_REQUIRED");
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(inputPath, "utf8"));
} catch {
  throw new Error("INVALID_SANDBOX_CREDENTIAL_FILE");
}
const parsed = z
  .object({
    provider: z.literal("Mindbody"),
    account: z.literal("-99"),
    apiKey: z.string().min(1),
    token: z.string().min(1).optional(),
  })
  .strict()
  .safeParse(raw);
if (!parsed.success) throw new Error("INVALID_SANDBOX_CREDENTIAL_FILE");
const input = parsed.data;
const key = Buffer.from(readFileSync(keyPath, "utf8").trim(), "base64");
if (key.length !== 32) throw new Error("INVALID_ENCRYPTION_CONFIGURATION");
const db = new PilotDatabase(developmentPath(process.env.SCC_DB_PATH), key);
try {
  if (!db.db.prepare("SELECT id FROM orgs WHERE id=?").get(org))
    throw new Error("ORGANIZATION_REQUIRED");
  db.putSecret(org, input.provider, input.account, {
    apiKey: input.apiKey,
    token: input.token,
  });
  console.log(
    "Encrypted sandbox credential imported. Authorization remains unverified until approved reads are qualified.",
  );
} finally {
  db.close();
}
