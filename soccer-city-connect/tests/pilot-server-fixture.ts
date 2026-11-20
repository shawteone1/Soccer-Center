// Test-only local provisioning. Secrets are generated at runtime and never embedded in the app/export.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { PilotDatabase } from "../backend/database";
import { createApp } from "../backend/server";
import { opaque } from "../backend/security";
const directory = resolve(".pilot/browser-test");
rmSync(directory, { recursive: true, force: true });
mkdirSync(directory, { recursive: true, mode: 0o700 });
const password = opaque(),
  db = new PilotDatabase(resolve(directory, "test.sqlite"), randomBytes(32));
db.provision("browser-org", "test-admin", password, "admin");
db.provision("browser-org", "test-viewer", password, "viewer");
db.provision("other-org", "other-staff", opaque(), "admin");
writeFileSync(resolve(directory, "login.json"), JSON.stringify({ password }), {
  mode: 0o600,
});
const server = createApp(db).listen(5188, "127.0.0.1");
process.on("SIGTERM", () =>
  server.close(() => {
    db.close();
    process.exit(0);
  }),
);
