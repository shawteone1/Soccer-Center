import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { PilotDatabase } from "../backend/database";
import { developmentPath } from "../backend/config";
import { createApp } from "../backend/server";
import { SquareOAuth } from "../backend/oauth";
import { opaque, encryption, redact, digest } from "../backend/security";
import { setupOf, reviewAssociation, connectionAction } from "../pilot";
import { recordKey } from "../model";
import type { Transport } from "../integration/contracts";
let db: PilotDatabase,
  dir: string,
  password: string,
  server: Server | undefined,
  base: string,
  key: Buffer;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "scc-foundation-"));
  key = randomBytes(32);
  db = new PilotDatabase(join(dir, "state.sqlite"), key);
  password = opaque();
  db.provision("alpha", "admin", password, "admin");
  db.provision("alpha", "operator", password, "operator");
  db.provision("alpha", "viewer", password, "viewer");
  db.provision("beta", "other-admin", password, "admin");
});
afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = undefined;
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
const sourceKey = () =>
  Object.keys(db.state("admin", "alpha").state.records).find((k) =>
    k.includes("MB-W-102"),
  )!;
async function start(transport?: Transport) {
  server = createApp(db, { enableSandbox: "Square", transport }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((r) => server!.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
async function call(
  path: string,
  body?: unknown,
  session?: ReturnType<PilotDatabase["login"]>,
  origin = "http://127.0.0.1:5188",
) {
  return fetch(base + "/pilot-api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(session
        ? {
            Cookie: `scc_session=${session.token}`,
            "X-CSRF-Token": session.csrf,
          }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
describe("Isolated durable backend — local fixtures, not a hosted pilot", () => {
  it("persists setup/tasks/mappings/history and sessions through process/database restart", () => {
    const session = db.login("admin", password),
      k = sourceKey();
    let snap = db.state("admin", "alpha");
    const setup = setupOf(snap.state);
    setup.organization = "Fictional alpha";
    setup.step = 3;
    snap = db.mutate("admin", "alpha", snap.revision, { type: "setup", setup });
    snap = db.mutate("admin", "alpha", snap.revision, {
      type: "assign",
      key: k,
      owner: "casey",
    });
    snap = db.mutate("admin", "alpha", snap.revision, {
      type: "note",
      key: k,
      text: "Fictional review evidence.",
    });
    snap = db.mutate("admin", "alpha", snap.revision, {
      type: "association",
      key: k,
      personId: "athlete",
      reason: "Confirmed via fictional account reference",
    });
    snap = db.mutate("admin", "alpha", snap.revision, {
      type: "complete",
      key: k,
    });
    db.close();
    db = new PilotDatabase(join(dir, "state.sqlite"), key);
    const reopened = db.state("admin", "alpha");
    expect(reopened).toEqual(snap);
    expect(db.session(session.token).user_id).toBe("admin");
    expect(reopened.state.audit.at(-1)?.actor).toBe("admin");
    expect(reopened.state.records[k].rawStatus).toBe("Missing");
    const count = db.db
      .prepare("SELECT COUNT(*) AS n FROM audit WHERE org_id=?")
      .get("alpha") as { n: number };
    expect(Number(count.n)).toBe(snap.state.audit.length);
  });
  it("denies role escalation, cross-org access, unknown commands and stale revisions", () => {
    const k = sourceKey();
    expect(() => db.state("admin", "beta")).toThrow("FORBIDDEN");
    expect(() =>
      db.mutate("viewer", "alpha", 0, {
        type: "assign",
        key: k,
        owner: "casey",
      }),
    ).toThrow("FORBIDDEN");
    expect(() =>
      db.mutate("operator", "alpha", 0, {
        type: "setup",
        setup: setupOf(db.state("operator", "alpha").state),
      }),
    ).toThrow("FORBIDDEN");
    expect(() =>
      db.mutate("admin", "alpha", 0, {
        type: "assign",
        key: k,
        owner: "casey",
        role: "admin",
      }),
    ).toThrow();
    db.mutate("admin", "alpha", 0, { type: "assign", key: k, owner: "casey" });
    expect(() =>
      db.mutate("admin", "alpha", 0, { type: "complete", key: k }),
    ).toThrow("REVISION_CONFLICT");
  });
  it("requires session and CSRF, uses HttpOnly cookies, and rejects tenant reads even with forged headers", async () => {
    await start();
    expect((await call("/orgs/alpha/state")).status).toBe(401);
    expect(
      (
        await call(
          "/login",
          { username: "admin", password },
          undefined,
          "https://foreign.invalid",
        )
      ).status,
    ).toBe(403);
    const login = await call("/login", { username: "admin", password });
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    expect(login.headers.get("set-cookie")).toContain("SameSite=Lax");
    const session = db.login("admin", password);
    expect((await call("/orgs/beta/state", undefined, session)).status).toBe(
      403,
    );
    const forbidden = await fetch(base + "/pilot-api/orgs/alpha/command", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:5188",
        "Content-Type": "application/json",
        Cookie: `scc_session=${session.token}`,
      },
      body: JSON.stringify({ revision: 0, command: { type: "reset" } }),
    });
    expect(forbidden.status).toBe(403);
    const viewer = db.login("viewer", password);
    expect(
      (
        await call(
          "/orgs/alpha/command",
          { revision: 0, command: { type: "complete", key: sourceKey() } },
          viewer,
        )
      ).status,
    ).toBe(403);
    db.logout(session.token);
    expect((await call("/orgs/alpha/state", undefined, session)).status).toBe(
      401,
    );
  });
  it("encrypts tenant-scoped credentials, rejects missing/wrong keys and keeps tokens out of errors/state", async () => {
    expect(() => developmentPath("/workspace/production.sqlite")).toThrow(
      "ISOLATED_DEVELOPMENT_DATABASE_REQUIRED",
    );
    expect(developmentPath(join(dir, "isolated.sqlite"))).toBe(
      join(dir, "isolated.sqlite"),
    );
    const secret = opaque();
    db.putSecret("alpha", "Square", "merchant-a", {
      access_token: secret,
      refresh_token: opaque(),
    });
    expect(db.getSecret("beta", "Square", "merchant-a")).toBeUndefined();
    expect(db.getSecret("alpha", "Square", "merchant-a").access_token).toBe(
      secret,
    );
    expect(
      readFileSync(join(dir, "state.sqlite")).includes(Buffer.from(secret)),
    ).toBe(false);
    const envelope = db.db.prepare("SELECT envelope FROM secrets").get() as {
      envelope: string;
    };
    expect(envelope.envelope).not.toContain(secret);
    expect(() => encryption(undefined).seal({}, "x")).toThrow(
      "ENCRYPTION_KEY_REQUIRED",
    );
    expect(() =>
      encryption(randomBytes(32)).open(envelope.envelope, "wrong"),
    ).toThrow();
    expect(
      JSON.stringify(
        redact({
          authorization: `Bearer ${secret}`,
          nested: { refresh_token: secret },
          url: `/?code=${secret}`,
        }),
      ),
    ).not.toContain(secret);
    expect(() =>
      db.mutate("admin", "alpha", 0, {
        type: "note",
        key: sourceKey(),
        text: `Authorization: Bearer ${secret}`,
      }),
    ).toThrow("SENSITIVE_INPUT_REJECTED");
    await start();
    const session = db.login("admin", password);
    const text = await (
      await call("/orgs/alpha/state", undefined, session)
    ).text();
    expect(text).not.toContain(secret);
  });
  it("binds Square sandbox PKCE state to session/org, rejects replay/expiry, and rotates tokens", async () => {
    const login = db.login("admin", password),
      other = db.login("other-admin", password),
      calls: Record<string, string>[] = [];
    const secret = opaque();
    const authorizationSnapshot = db.state("admin", "alpha"),
      authorizationSetup = setupOf(authorizationSnapshot.state);
    authorizationSetup.connections.Square.mode = "sandbox";
    db.mutate("admin", "alpha", authorizationSnapshot.revision, {
      type: "setup",
      setup: authorizationSetup,
    });
    const oauth = new SquareOAuth(
      db,
      {
        clientId: "fixture-application-id",
        redirectUri: "http://127.0.0.1:5188/pilot-api/oauth/square/callback",
      },
      async (body) => {
        calls.push(body);
        return {
          access_token: secret,
          refresh_token: opaque(),
          expires_at: "2027-01-01T00:00:00Z",
          merchant_id: "merchant-a",
        };
      },
    );
    const start = oauth.begin(login.token, "alpha"),
      url = new URL(start.url),
      state = url.searchParams.get("state")!;
    expect(url.origin).toBe("https://connect.squareupsandbox.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(start.url).not.toContain(secret);
    await expect(
      oauth.callback(other.token, state, "fixture-code"),
    ).rejects.toThrow("OAUTH_STATE_INVALID");
    const result = await oauth.callback(login.token, state, "fixture-code");
    expect(result.authorization).toBe("unverified");
    expect(calls[0].code_verifier).toBeTruthy();
    expect(db.getSecret("alpha", "Square", "merchant-a").access_token).toBe(
      secret,
    );
    await expect(oauth.callback(login.token, state, "replay")).rejects.toThrow(
      "OAUTH_STATE_INVALID",
    );
    await oauth.refresh("alpha", "merchant-a");
    expect(calls[1].grant_type).toBe("refresh_token");
    const deniedState = new URL(
      oauth.begin(login.token, "alpha").url,
    ).searchParams.get("state")!;
    expect(oauth.deny(login.token, deniedState).authorization).toBe("denied");
    expect(
      db.state("admin", "alpha").state.pilot?.connections.Square.authorization,
    ).toBe("denied");
    const expired = new URL(
      oauth.begin(login.token, "alpha").url,
    ).searchParams.get("state")!;
    db.db
      .prepare("UPDATE oauth SET expires=0 WHERE state_hash=?")
      .run(digest(expired));
    await expect(
      oauth.callback(login.token, expired, "expired"),
    ).rejects.toThrow("OAUTH_STATE_INVALID");
  });
  it("commits paginated fixture reads atomically, scopes IDs, preserves tasks and checkpoints across failure", async () => {
    let fail = false,
      n = 0;
    await start(async (req) => {
      n++;
      if (fail && req.path.includes("cursor="))
        return { status: 503, body: { access_token: "not-for-logs" } };
      return {
        status: 200,
        body: req.path.includes("cursor=")
          ? { payments: [{ id: "two", status: "PENDING" }] }
          : {
              payments: [
                {
                  id: "one",
                  status: "COMPLETED",
                  card_details: { secret: "excluded" },
                },
              ],
              cursor: "next",
            },
      };
    });
    const session = db.login("admin", password);
    let snap = db.state("admin", "alpha");
    const setup = setupOf(snap.state);
    setup.connections.Square.mode = "sandbox";
    setup.connections.Square.locations = [];
    setup.connections.Square.programs = [];
    setup.connections.Square.account = "merchant-a";
    snap = db.mutate("admin", "alpha", snap.revision, { type: "setup", setup });
    snap = db.mutate("admin", "alpha", snap.revision, {
      type: "complete",
      key: sourceKey(),
    });
    db.putSecret("alpha", "Square", "merchant-a", { access_token: opaque() });
    expect(
      (
        await call(
          "/orgs/alpha/read",
          { provider: "Square", operation: "payments" },
          session,
        )
      ).status,
    ).toBe(200);
    let imported = db.state("admin", "alpha");
    expect(
      Object.values(imported.state.records).filter(
        (r) => r.organizationId === "alpha",
      ),
    ).toHaveLength(2);
    const tasks = structuredClone(imported.state.tasks),
      resolutions = structuredClone(imported.state.resolutions);
    expect(
      (
        await call(
          "/orgs/alpha/read",
          { provider: "Square", operation: "payments" },
          session,
        )
      ).status,
    ).toBe(200);
    imported = db.state("admin", "alpha");
    expect(imported.state.tasks).toEqual(tasks);
    expect(imported.state.resolutions).toEqual(resolutions);
    expect(Object.keys(imported.state.records)).toHaveLength(11);
    const checkpoints = db.db.prepare("SELECT * FROM checkpoints").all();
    const records = structuredClone(imported.state.records);
    fail = true;
    n = 0;
    const failed = await call(
      "/orgs/alpha/read",
      { provider: "Square", operation: "payments" },
      session,
    );
    expect(failed.status).toBe(400);
    expect(await failed.text()).not.toContain("not-for-logs");
    expect(db.state("admin", "alpha").state.records).toEqual(records);
    expect(db.db.prepare("SELECT * FROM checkpoints").all()).toEqual(
      checkpoints,
    );
    expect(db.state("admin", "alpha").state.health.Square.stale).toBe(true);
    const latest = db.state("admin", "alpha");
    db.mutate("admin", "alpha", latest.revision, {
      type: "connection",
      provider: "Square",
      action: "disconnect",
    });
    db.deleteSecrets("alpha", "Square");
    expect(db.getSecret("alpha", "Square", "merchant-a")).toBeUndefined();
    expect(db.state("admin", "alpha").state.resolutions).toEqual(resolutions);
  });
  it("keeps ambiguous associations separate and permits explicit audited corrections without changing sources", () => {
    const s = db.state("admin", "alpha").state,
      k = Object.keys(s.records).find((k) => k.includes("MB-M-999"))!,
      raw = structuredClone(s.records);
    let next = reviewAssociation(
      s,
      k,
      "athlete",
      "Independent fictional confirmation",
      "admin",
    );
    next = reviewAssociation(
      next,
      k,
      null,
      "Correction: keep separate",
      "admin",
    );
    expect(next.records).toEqual(raw);
    expect(next.pilot?.associations[k].personId).toBeNull();
    expect(next.audit.at(-1)?.actor).toBe("admin");
    expect(connectionAction(next, "Mindbody", "revoked").resolutions).toEqual(
      s.resolutions,
    );
    expect(recordKey(s.records[k])).toBe(k);
  });
  it("persists denied/expired/revoked access and rate-limit deferral without closing local tasks", async () => {
    let status = 401,
      calls = 0;
    await start(async () => {
      calls++;
      return {
        status,
        headers: { "retry-after": "3600" },
        body: { access_token: "must-not-appear" },
      };
    });
    const session = db.login("admin", password);
    let snap = db.state("admin", "alpha");
    const setup = setupOf(snap.state);
    setup.connections.Square.mode = "sandbox";
    setup.connections.Square.account = "merchant-a";
    snap = db.mutate("admin", "alpha", snap.revision, { type: "setup", setup });
    db.putSecret("alpha", "Square", "merchant-a", { access_token: opaque() });
    const first = await call(
      "/orgs/alpha/read",
      { provider: "Square", operation: "payments" },
      session,
    );
    expect(first.status).toBe(400);
    expect(
      db.state("admin", "alpha").state.pilot?.connections.Square.authorization,
    ).toBe("expired");
    expect(db.state("admin", "alpha").state.resolutions).toEqual({});
    status = 403;
    await call(
      "/orgs/alpha/read",
      { provider: "Square", operation: "payments" },
      session,
    );
    expect(
      db.state("admin", "alpha").state.pilot?.connections.Square.authorization,
    ).toBe("denied");
    status = 429;
    const limited = await call(
      "/orgs/alpha/read",
      { provider: "Square", operation: "payments" },
      session,
    );
    expect((await limited.json()).retryAt).toBeTruthy();
    const count = calls;
    const deferred = await call(
      "/orgs/alpha/read",
      { provider: "Square", operation: "payments" },
      session,
    );
    expect((await deferred.json()).error).toBe("RETRY_NOT_DUE");
    expect(calls).toBe(count);
    const latest = db.state("admin", "alpha");
    const revoked = await call(
      "/orgs/alpha/command",
      {
        revision: latest.revision,
        command: { type: "connection", provider: "Square", action: "revoked" },
      },
      session,
    );
    expect(revoked.status).toBe(200);
    expect(db.getSecret("alpha", "Square", "merchant-a")).toBeUndefined();
    expect(db.state("admin", "alpha").state.resolutions).toEqual({});
  });
});
