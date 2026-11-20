import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { PilotDatabase } from "../backend/database";
import { opaque } from "../backend/security";
const root = fileURLToPath(new URL("../", import.meta.url));
const tsx = fileURLToPath(
  new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url),
);
describe("Local host-admin CLI boundaries", () => {
  it("requires an explicit role and provisions only the selected isolated database without printing passwords", () => {
    const dir = mkdtempSync(join(tmpdir(), "scc-cli-")),
      path = join(dir, "state.sqlite"),
      password = opaque();
    try {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        SCC_DB_PATH: path,
        SCC_BOOTSTRAP_USER: "cli-user",
        SCC_BOOTSTRAP_ORG: "cli-org",
        SCC_BOOTSTRAP_PASSWORD: password,
      };
      delete env.SCC_BOOTSTRAP_ROLE;
      const refused = spawnSync(
        process.execPath,
        [tsx, "backend/provision.ts"],
        { cwd: root, env, encoding: "utf8" },
      );
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toContain(
        "EXPLICIT_USER_PASSWORD_ORG_ROLE_REQUIRED",
      );
      expect(refused.stderr).not.toContain(password);
      const output = execFileSync(
        process.execPath,
        [tsx, "backend/provision.ts"],
        {
          cwd: root,
          env: { ...env, SCC_BOOTSTRAP_ROLE: "viewer" },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      expect(output).not.toContain(password);
      const db = new PilotDatabase(path);
      try {
        expect(db.role("cli-user", "cli-org")).toBe("viewer");
        expect(db.login("cli-user", password).user).toBe("cli-user");
        expect(
          db.db.prepare("SELECT actor FROM access_audit").get(),
        ).toBeTruthy();
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("imports only an explicit Mindbody public-sandbox credential into the encrypted tenant vault", () => {
    const dir = mkdtempSync(join(tmpdir(), "scc-vault-cli-")),
      path = join(dir, "state.sqlite"),
      key = randomBytes(32),
      token = opaque();
    try {
      const db = new PilotDatabase(path, key);
      db.provision("cli-org", "host", opaque(), "admin");
      db.close();
      const keyFile = join(dir, "master.key"),
        credentialFile = join(dir, "credential.json");
      writeFileSync(keyFile, key.toString("base64"), { mode: 0o600 });
      writeFileSync(
        credentialFile,
        JSON.stringify({ provider: "Mindbody", account: "-99", apiKey: token }),
        { mode: 0o600 },
      );
      const output = execFileSync(
        process.execPath,
        [tsx, "backend/import-credential.ts"],
        {
          cwd: root,
          env: {
            ...process.env,
            SCC_DB_PATH: path,
            SCC_MASTER_KEY_FILE: keyFile,
            SCC_CREDENTIAL_FILE: credentialFile,
            SCC_CREDENTIAL_ORG: "cli-org",
          },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      expect(output).not.toContain(token);
      const reopened = new PilotDatabase(path, key);
      try {
        expect(reopened.getSecret("cli-org", "Mindbody", "-99").apiKey).toBe(
          token,
        );
        expect(
          JSON.stringify(reopened.db.prepare("SELECT * FROM secrets").all()),
        ).not.toContain(token);
      } finally {
        reopened.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
