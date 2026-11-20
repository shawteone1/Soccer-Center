import express from "express";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { PilotDatabase } from "./database";
import { developmentPath } from "./config";
import { commandSchema } from "./commands";
import { SquareOAuth, sandboxTokenExchange } from "./oauth";
import { digest, redact } from "./security";
import { providers, recordKey, type State } from "../model";
import { setupOf, followUpDate } from "../pilot";
import { seedTasks } from "../operations";
import {
  readContract,
  squareSandboxTransport,
  mindbodySandboxTransport,
  ImportError,
  type Transport,
} from "../integration/contracts";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function createApp(
  db: PilotDatabase,
  options: {
    origin?: string;
    enableSandbox?: string;
    clientId?: string;
    transport?: Transport;
  } = {},
) {
  const origin = options.origin ?? "http://127.0.0.1:5188";
  if (origin !== "http://127.0.0.1:5188")
    throw new Error("LOCAL_ORIGIN_REQUIRED");
  const enabled = new Set(
    options.enableSandbox?.split(",").filter(Boolean) ?? [],
  );
  if ([...enabled].some((p) => !["Square", "Mindbody"].includes(p)))
    throw new Error("INVALID_SANDBOX_PROVIDER");
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    next();
  });
  app.use(express.json({ limit: "80kb" }));
  const attempts = new Map<string, { count: number; reset: number }>();
  app.use("/pilot-api", (_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    next();
  });
  const token = (req: express.Request) =>
    req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("scc_session="))
      ?.slice(12) ?? "";
  app.use("/pilot-api", (req, res, next) => {
    try {
      if (req.method !== "GET" && req.headers.origin !== origin)
        throw new Error("ORIGIN_DENIED");
      if (req.path === "/login") return next();
      const session = db.session(token(req));
      res.locals.session = session;
      if (req.method !== "GET" && req.headers["x-csrf-token"] !== session.csrf)
        throw new Error("CSRF_DENIED");
      next();
    } catch (e) {
      next(e);
    }
  });
  app.post("/pilot-api/login", (req, res, next) => {
    try {
      const input = z
        .object({
          username: z.string().min(1).max(120),
          password: z.string().min(1).max(256),
        })
        .strict()
        .parse(req.body);
      const id = digest((req.ip ?? "local") + input.username),
        old = attempts.get(id);
      const rate =
        old && old.reset > Date.now()
          ? old
          : { count: 0, reset: Date.now() + 60000 };
      if (++rate.count > 8) throw new Error("LOGIN_RATE_LIMITED");
      attempts.set(id, rate);
      const session = db.login(input.username, input.password);
      res.cookie("scc_session", session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/pilot-api",
        maxAge: 8 * 3600000,
      });
      res.json({ user: session.user, csrf: session.csrf });
    } catch (e) {
      next(e);
    }
  });
  app.get("/pilot-api/session", (_req, res) =>
    res.json({
      user: res.locals.session.user_id,
      csrf: res.locals.session.csrf,
    }),
  );
  app.post("/pilot-api/logout", (req, res) => {
    db.logout(token(req));
    res.clearCookie("scc_session", { path: "/pilot-api" });
    res.json({ ok: true });
  });
  app.get("/pilot-api/orgs/:org/state", (req, res, next) => {
    try {
      res.json(db.state(res.locals.session.user_id, String(req.params.org)));
    } catch (e) {
      next(e);
    }
  });
  app.post("/pilot-api/orgs/:org/command", (req, res, next) => {
    try {
      const body = z
        .object({
          revision: z.number().int().nonnegative(),
          command: commandSchema,
        })
        .strict()
        .parse(req.body);
      const org = String(req.params.org),
        result = db.mutate(
          res.locals.session.user_id,
          org,
          body.revision,
          body.command,
        );
      if (
        body.command.type === "connection" &&
        ["disconnect", "revoked"].includes(body.command.action)
      )
        db.deleteSecrets(org, body.command.provider);
      if (body.command.type === "reset") {
        for (const p of providers) db.deleteSecrets(org, p);
        db.db.prepare("DELETE FROM checkpoints WHERE org_id=?").run(org);
      }
      res.json(result);
    } catch (e) {
      next(e);
    }
  });
  const oauth = () => {
    if (!options.clientId) throw new Error("SQUARE_SANDBOX_APP_REQUIRED");
    if (!enabled.has("Square")) throw new Error("SANDBOX_NOT_ENABLED");
    return new SquareOAuth(
      db,
      {
        clientId: options.clientId,
        redirectUri: origin + "/pilot-api/oauth/square/callback",
      },
      sandboxTokenExchange(enabled.has("Square")),
    );
  };
  app.post("/pilot-api/orgs/:org/oauth/square/start", (req, res, next) => {
    try {
      const org = String(req.params.org);
      const c = setupOf(db.state(res.locals.session.user_id, org).state)
        .connections.Square;
      if (c.mode !== "sandbox" || !c.selected)
        throw new Error("SANDBOX_SETTINGS_REQUIRED");
      res.json(oauth().begin(token(req), org));
    } catch (e) {
      next(e);
    }
  });
  app.get("/pilot-api/oauth/square/callback", async (req, res, next) => {
    try {
      const q = z
        .object({
          state: z.string().max(200),
          code: z.string().max(1000).optional(),
          error: z.string().max(120).optional(),
        })
        .parse(req.query);
      if (q.error) {
        oauth().deny(token(req), q.state);
        res.redirect(303, "/?pilot=1#admin");
        return;
      }
      if (!q.code) throw new Error("AUTHORIZATION_CODE_REQUIRED");
      await oauth().callback(token(req), q.state, q.code);
      res.redirect(303, "/?pilot=1#admin");
    } catch (e) {
      next(e);
    }
  });
  app.post(
    "/pilot-api/orgs/:org/oauth/square/refresh",
    async (req, res, next) => {
      try {
        const org = String(req.params.org);
        if (db.role(res.locals.session.user_id, org) !== "admin")
          throw new Error("FORBIDDEN");
        const body = z
          .object({ account: z.string().max(200) })
          .strict()
          .parse(req.body);
        res.json(await oauth().refresh(org, body.account));
      } catch (e) {
        next(e);
      }
    },
  );
  app.post("/pilot-api/orgs/:org/read", async (req, res, next) => {
    try {
      const user = res.locals.session.user_id,
        org = String(req.params.org);
      if (db.role(user, org) !== "admin") throw new Error("FORBIDDEN");
      const input = z
        .object({
          provider: z.enum(providers),
          operation: z.enum([
            "clients",
            "memberships",
            "registrations",
            "schedules",
            "customers",
            "locations",
            "payments",
            "orders",
          ]),
          clientId: z.string().max(200).optional(),
        })
        .strict()
        .parse(req.body);
      const start = db.state(user, org),
        p = input.provider,
        c = setupOf(start.state).connections[p];
      if (c.mode !== "sandbox" || c.disabled || !c.selected)
        throw new Error("SANDBOX_SETTINGS_REQUIRED");
      const category = {
        clients: "clients",
        memberships: "memberships",
        registrations: "registrations",
        schedules: "schedule",
        customers: "customers",
        locations: "locations",
        payments: "commerce",
        orders: "commerce",
      }[input.operation];
      if (!c.categories.includes(category))
        throw new Error("CATEGORY_NOT_PERMITTED");
      if (
        start.state.health[p].retryAt &&
        Date.parse(start.state.health[p].retryAt!) > Date.now()
      )
        throw new ImportError("RETRY_NOT_DUE", start.state.health[p].retryAt);
      if (!enabled.has(p)) throw new Error("SANDBOX_NOT_ENABLED");
      const secret = db.getSecret(org, p, c.account);
      if (!secret) throw new Error("AUTHORIZED_CREDENTIAL_REQUIRED");

      const scope = digest(
        JSON.stringify([
          input.operation,
          input.clientId,
          c.locations.slice().sort(),
          c.programs.slice().sort(),
        ]),
      );
      const checkpoint = db.db
        .prepare(
          "SELECT stamp FROM checkpoints WHERE org_id=? AND provider=? AND account=? AND operation=?",
        )
        .get(org, p, c.account, scope) as { stamp: string } | undefined;
      const since = checkpoint
        ? new Date(Date.parse(checkpoint.stamp) - 300000).toISOString()
        : undefined;
      try {
        if (secret.expires_at && Date.parse(secret.expires_at) < Date.now())
          throw new ImportError("ACCESS_EXPIRED_OR_REVOKED");
        const result = await readContract(
          {
            organizationId: org,
            provider: p,
            account: c.account,
            operation: input.operation,
            clientId: input.clientId,
            locationIds: c.locations,
            mode: options.transport ? "fixture" : "sandbox",
            since,
            credentials: {
              token: secret.access_token ?? secret.token,
              apiKey: secret.apiKey,
            },
          },
          options.transport ??
            (p === "Square"
              ? squareSandboxTransport(true)
              : mindbodySandboxTransport(true)),
        );
        const updated = db.transaction(() => {
          const latest = db.state(user, org);
          if (latest.revision !== start.revision)
            throw new Error("REVISION_CONFLICT");
          const records = { ...latest.state.records };
          for (const r of result.records) {
            if (
              input.operation !== "locations" &&
              c.locations.length &&
              r.location &&
              !c.locations.includes(r.location)
            )
              continue;
            if (
              c.programs.length &&
              r.programId &&
              !c.programs.includes(r.programId)
            )
              continue;
            records[recordKey(r)] = r;
          }
          const seeded = seedTasks(records);
          const rule = setupOf(latest.state);
          for (const [key, task] of Object.entries(seeded))
            if (!latest.state.tasks[key])
              seeded[key] = {
                ...task,
                assigneeId: rule.defaultOwner,
                dueOn: followUpDate(rule, result.checkpoint),
                createdAt: result.checkpoint,
                updatedAt: result.checkpoint,
              };
          const next: State = {
            ...latest.state,
            records,
            tasks: { ...seeded, ...latest.state.tasks },
            health: {
              ...latest.state.health,
              [p]: {
                lastAttempt: new Date().toISOString(),
                lastSuccess: result.checkpoint,
                error: null,
                attempts: 1,
                stale: false,
              },
            },
            audit: [
              ...latest.state.audit,
              {
                id: (latest.state.audit.at(-1)?.id ?? 0) + 1,
                at: new Date().toISOString(),
                actor: user,
                action: "Sandbox read completed",
                source: p,
                before: "unverified",
                after: `${result.records.length} projected records; no production access`,
                mode: "sandbox",
              },
            ],
          };
          // Reads do not establish ongoing authorization: a separate verified account grant is still required.
          db.commit(org, latest.state, next, latest.revision);
          db.db
            .prepare(
              "INSERT INTO checkpoints VALUES(?,?,?,?,?) ON CONFLICT(org_id,provider,account,operation) DO UPDATE SET stamp=excluded.stamp",
            )
            .run(org, p, c.account, scope, result.checkpoint);
          return db.state(user, org);
        });
        res.json(updated);
      } catch (e) {
        if (e instanceof ImportError) {
          db.transaction(() => {
            const latest = db.state(user, org),
              pilot = structuredClone(setupOf(latest.state));
            if (e.code === "ACCESS_EXPIRED_OR_REVOKED")
              pilot.connections[p].authorization = "expired";
            if (e.code === "ACCESS_DENIED")
              pilot.connections[p].authorization = "denied";
            const next = {
              ...latest.state,
              pilot,
              health: {
                ...latest.state.health,
                [p]: {
                  ...latest.state.health[p],
                  lastAttempt: new Date().toISOString(),
                  stale: true,
                  error: e.code,
                  retryAt: e.retryAt,
                },
              },
              audit: [
                ...latest.state.audit,
                {
                  id: (latest.state.audit.at(-1)?.id ?? 0) + 1,
                  at: new Date().toISOString(),
                  actor: user,
                  action: "Sandbox read failed",
                  source: p,
                  before: "last-known data",
                  after: e.code,
                  mode: "sandbox" as const,
                },
              ],
            };
            db.commit(org, latest.state, next, latest.revision);
          });
        }
        throw e;
      }
    } catch (e) {
      next(e);
    }
  });
  const build = resolve(root, "build");
  if (existsSync(build)) {
    app.use(express.static(build, { index: false }));
    app.get("/", (_req, res) => res.sendFile(resolve(build, "index.html")));
  }
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const code =
        error instanceof ImportError
          ? error.code
          : error instanceof z.ZodError
            ? "INVALID_INPUT"
            : error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
              ? error.message
              : "REQUEST_FAILED";
      const status =
        code === "UNAUTHORIZED"
          ? 401
          : ["FORBIDDEN", "CSRF_DENIED", "ORIGIN_DENIED"].includes(code)
            ? 403
            : code === "REVISION_CONFLICT"
              ? 409
              : code === "LOGIN_RATE_LIMITED"
                ? 429
                : 400;
      res.status(status).json(
        redact({
          error: code,
          ...(error instanceof ImportError && error.retryAt
            ? { retryAt: error.retryAt }
            : {}),
        }),
      );
    },
  );
  return app;
}
export function runServer() {
  const path = developmentPath(process.env.SCC_DB_PATH);
  const key = process.env.SCC_MASTER_KEY_FILE
    ? Buffer.from(
        readFileSync(process.env.SCC_MASTER_KEY_FILE, "utf8").trim(),
        "base64",
      )
    : undefined;
  if (key && key.length !== 32)
    throw new Error("INVALID_ENCRYPTION_CONFIGURATION");
  const db = new PilotDatabase(path, key);
  const app = createApp(db, {
    enableSandbox: process.env.SCC_ENABLE_SANDBOX,
    clientId: process.env.SCC_SQUARE_SANDBOX_CLIENT_ID,
  });
  app.listen(5188, "127.0.0.1", () =>
    console.log(
      "Isolated fictional pilot foundation: http://127.0.0.1:5188/?pilot=1",
    ),
  );
  return db;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  runServer();
