import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { userInfo } from "node:os";
import { initial } from "../store";
import { type State } from "../model";
import { execute, type Role } from "./commands";
import {
  digest,
  opaque,
  passwordHash,
  passwordMatches,
  encryption,
} from "./security";
export class PilotDatabase {
  db: DatabaseSync;
  vault: ReturnType<typeof encryption>;
  constructor(path: string, key?: Buffer) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.vault = encryption(key);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS orgs(id TEXT PRIMARY KEY,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,password TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS memberships(user_id TEXT REFERENCES users(id),org_id TEXT REFERENCES orgs(id),role TEXT NOT NULL CHECK(role IN ('admin','operator','viewer')),PRIMARY KEY(user_id,org_id));
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(org_id TEXT REFERENCES orgs(id),seq INTEGER,payload TEXT NOT NULL,PRIMARY KEY(org_id,seq));
 CREATE TABLE IF NOT EXISTS secrets(org_id TEXT REFERENCES orgs(id),provider TEXT,account TEXT,envelope TEXT NOT NULL,PRIMARY KEY(org_id,provider,account));
 CREATE TABLE IF NOT EXISTS checkpoints(org_id TEXT,provider TEXT,account TEXT,operation TEXT,stamp TEXT,PRIMARY KEY(org_id,provider,account,operation));
 CREATE TABLE IF NOT EXISTS access_audit(id INTEGER PRIMARY KEY,org_id TEXT,actor TEXT,target TEXT,role TEXT,at TEXT);
 CREATE TABLE IF NOT EXISTS oauth(state_hash TEXT PRIMARY KEY,session_hash TEXT,org_id TEXT,expires INTEGER,envelope TEXT);
 `);
  }
  close() {
    this.db.close();
  }
  provision(orgId: string, user: string, password: string, role: Role) {
    if (!/^[a-zA-Z0-9_-]{1,60}$/.test(orgId) || !user || user.length > 120)
      throw new Error("INVALID_ID");
    const state = initial();
    this.db
      .prepare("INSERT OR IGNORE INTO orgs(id,state) VALUES(?,?)")
      .run(orgId, JSON.stringify(state));
    this.db
      .prepare(
        "INSERT INTO users(id,password) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET password=excluded.password",
      )
      .run(user, passwordHash(password));
    this.db
      .prepare(
        "INSERT INTO memberships(user_id,org_id,role) VALUES(?,?,?) ON CONFLICT(user_id,org_id) DO UPDATE SET role=excluded.role",
      )
      .run(user, orgId, role);
    this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(user);
    this.db
      .prepare(
        "INSERT INTO access_audit(org_id,actor,target,role,at) VALUES(?,?,?,?,?)",
      )
      .run(
        orgId,
        `host:${userInfo().username}`,
        user,
        role,
        new Date().toISOString(),
      );
  }
  login(user: string, password: string) {
    const row = this.db
      .prepare("SELECT password FROM users WHERE id=?")
      .get(user) as { password: string } | undefined;
    const dummy = "00000000000000000000000000000000:" + "00".repeat(64);
    if (!passwordMatches(password, row?.password ?? dummy))
      throw new Error("UNAUTHORIZED");
    const token = opaque(),
      csrf = opaque();
    this.db
      .prepare(
        "INSERT INTO sessions(hash,user_id,csrf,expires) VALUES(?,?,?,?)",
      )
      .run(digest(token), user, csrf, Date.now() + 8 * 3600000);
    return { token, csrf, user };
  }
  session(token: string) {
    const row = this.db
      .prepare("SELECT user_id,csrf,expires FROM sessions WHERE hash=?")
      .get(digest(token)) as
      { user_id: string; csrf: string; expires: number } | undefined;
    if (!row || row.expires < Date.now()) throw new Error("UNAUTHORIZED");
    return row;
  }
  role(user: string, org: string) {
    const row = this.db
      .prepare("SELECT role FROM memberships WHERE user_id=? AND org_id=?")
      .get(user, org) as { role: Role } | undefined;
    if (!row) throw new Error("FORBIDDEN");
    return row.role;
  }
  state(user: string, org: string) {
    const role = this.role(user, org),
      row = this.db
        .prepare("SELECT state,revision FROM orgs WHERE id=?")
        .get(org) as { state: string; revision: number };
    return {
      state: JSON.parse(row.state) as State,
      revision: row.revision,
      role,
    };
  }
  mutate(user: string, org: string, revision: number, command: unknown) {
    const role = this.role(user, org);
    return this.transaction(() => {
      const old = this.state(user, org);
      if (old.revision !== revision) throw new Error("REVISION_CONFLICT");
      const next = execute(old.state, command, role, user);
      this.commit(org, old.state, next, revision);
      return { ...this.state(user, org) };
    });
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  commit(org: string, old: State, next: State, revision: number) {
    this.db
      .prepare(
        "UPDATE orgs SET state=?,revision=revision+1 WHERE id=? AND revision=?",
      )
      .run(JSON.stringify(next), org, revision);
    for (const entry of next.audit.slice(old.audit.length))
      this.db
        .prepare("INSERT INTO audit(org_id,seq,payload) VALUES(?,?,?)")
        .run(org, entry.id, JSON.stringify(entry));
  }
  putSecret(org: string, provider: string, account: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO secrets VALUES(?,?,?,?) ON CONFLICT(org_id,provider,account) DO UPDATE SET envelope=excluded.envelope",
      )
      .run(
        org,
        provider,
        account,
        this.vault.seal(value, JSON.stringify([org, provider, account])),
      );
  }
  getSecret(org: string, provider: string, account: string) {
    const row = this.db
      .prepare(
        "SELECT envelope FROM secrets WHERE org_id=? AND provider=? AND account=?",
      )
      .get(org, provider, account) as { envelope: string } | undefined;
    return row
      ? this.vault.open(row.envelope, JSON.stringify([org, provider, account]))
      : undefined;
  }
  deleteSecrets(org: string, provider: string) {
    this.db
      .prepare("DELETE FROM secrets WHERE org_id=? AND provider=?")
      .run(org, provider);
    this.db.prepare("DELETE FROM oauth WHERE org_id=?").run(org);
  }
  logout(token: string) {
    this.db.prepare("DELETE FROM sessions WHERE hash=?").run(digest(token));
  }
}
