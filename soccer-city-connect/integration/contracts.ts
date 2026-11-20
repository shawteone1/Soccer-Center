import { z } from "zod";
import { type Provider, type SourceRecord, recordKey } from "../model";
export interface Request {
  method: "GET" | "POST";
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}
export interface Response {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}
export type Transport = (request: Request) => Promise<Response>;
export class ImportError extends Error {
  constructor(
    public code: string,
    public retryAt?: string,
  ) {
    super(code);
  }
}
export interface ReadContext {
  organizationId: string;
  provider: Provider;
  account: string;
  operation:
    | "clients"
    | "memberships"
    | "registrations"
    | "schedules"
    | "customers"
    | "locations"
    | "payments"
    | "orders";
  clientId?: string;
  locationIds?: string[];
  since?: string;
  mode: "fixture" | "sandbox" | "live";
  credentials?: { token?: string; apiKey?: string };
  now?: () => number;
}
const id = z
  .union([z.string().min(1).max(200), z.number().finite()])
  .transform(String);
const row = z.object({ id: z.string().optional() }).passthrough();
const object = z.record(z.unknown());
const str = (v: unknown, fallback = "unknown") =>
  typeof v === "string" ? v.slice(0, 200) : fallback;
const asRows = (v: unknown) => z.array(row).parse(v);
const base = (
  c: ReadContext,
  kind: SourceRecord["kind"],
  sourceId: string,
  title: string,
  status: string,
  updated: unknown,
): SourceRecord => ({
  organizationId: c.organizationId,
  dataMode: c.mode === "fixture" ? "contract-fixture" : "sandbox",
  provider: c.provider,
  account: c.account,
  kind,
  sourceId,
  personId: null,
  title: title.slice(0, 160),
  rawStatus: status,
  status: status.toLowerCase(),
  sourceUpdatedAt:
    typeof updated === "string" ? updated : "not supplied by source",
  importedAt: new Date(c.now?.() ?? Date.now()).toISOString(),
});
function definition(c: ReadContext, page: string) {
  const headers: Record<string, string> = { Accept: "application/json" };
  let path = "",
    method: "GET" | "POST" = "GET";
  let body: unknown;
  const q = new URLSearchParams();
  if (c.provider === "Mindbody") {
    if (!["clients", "memberships"].includes(c.operation))
      throw new ImportError("UNSUPPORTED_OPERATION");
    headers["Api-Key"] = c.credentials?.apiKey ?? "";
    headers.SiteId = c.account;
    if (c.credentials?.token) headers.Authorization = c.credentials.token;
    path =
      c.operation === "clients"
        ? "/public/v6/client/clients"
        : "/public/v6/client/activeclientmemberships";
    q.set("request.limit", "100");
    q.set("request.offset", page || "0");
    if (c.operation === "memberships") {
      if (!c.clientId) throw new ImportError("CLIENT_ID_REQUIRED");
      q.set("request.clientId", c.clientId);
    }
    if (c.operation === "memberships" && c.locationIds?.length === 1)
      q.set("request.locationId", c.locationIds[0]);
    if (c.since && c.operation === "clients")
      q.set("request.lastModifiedDate", c.since);
  } else if (c.provider === "Playpass") {
    if (!["registrations", "schedules"].includes(c.operation))
      throw new ImportError("UNSUPPORTED_OPERATION");
    headers.Authorization = `Bearer ${c.credentials?.token ?? ""}`;
    headers["X-Playpass-Api-Version"] = "2026-02-08";
    headers["X-Playpass-Client"] = "soccer-city-connect/0.2";
    path = `/api/${c.operation}`;
    q.set("organizer_id", c.account);
    q.set("page", page || "1");
    q.set("per_page", "100");
  } else {
    if (!["customers", "locations", "payments", "orders"].includes(c.operation))
      throw new ImportError("UNSUPPORTED_OPERATION");
    headers.Authorization = `Bearer ${c.credentials?.token ?? ""}`;
    headers["Square-Version"] = "2026-11-18";
    path = `/v2/${c.operation}`;
    if (c.operation === "orders") {
      if (!c.locationIds?.length) throw new ImportError("LOCATIONS_REQUIRED");
      path += "/search";
      method = "POST";
      body = {
        location_ids: c.locationIds,
        limit: 100,
        ...(page ? { cursor: page } : {}),
        ...(c.since
          ? {
              query: {
                filter: {
                  date_time_filter: { updated_at: { start_at: c.since } },
                },
              },
            }
          : {}),
      };
    } else {
      if (page) q.set("cursor", page);
      if (c.operation !== "locations") q.set("limit", "100");
      if (c.since && c.operation === "payments")
        q.set("updated_at_begin_time", c.since);
    }
  }
  return { method, path: path + (q.size ? "?" + q : ""), headers, body };
}
function decode(
  c: ReadContext,
  payload: unknown,
  currentPage: string,
): { records: SourceRecord[]; next: string } {
  const b = object.parse(payload);
  if (Array.isArray(b.errors) && b.errors.length)
    throw new ImportError("SOURCE_ERROR");
  let rows: Record<string, unknown>[];
  let next = "";
  if (c.provider === "Mindbody") {
    rows = asRows(
      b[c.operation === "clients" ? "Clients" : "ClientMemberships"],
    );
    const p = z
      .object({
        RequestedOffset: z.number().nonnegative(),
        PageSize: z.number().nonnegative(),
        TotalResults: z.number().nonnegative(),
      })
      .parse(b.PaginationResponse);
    if (p.RequestedOffset + p.PageSize < p.TotalResults) {
      if (!p.PageSize) throw new ImportError("PAGINATION_INVALID");
      next = String(p.RequestedOffset + p.PageSize);
    }
  } else if (c.provider === "Playpass") {
    const data = object.parse(b.data),
      meta = object.parse(b.meta);
    if (data.organizer_id !== c.account)
      throw new ImportError("ACCOUNT_MISMATCH");
    rows = asRows(data[c.operation]);
    const p = z
      .object({
        page: z.number().int().min(1),
        total_pages: z.number().int().min(0),
      })
      .parse(meta[c.operation]);
    if (p.page < p.total_pages) next = String(p.page + 1);
  } else {
    rows = asRows(b[c.operation] ?? []);
    if (b.cursor !== undefined) next = z.string().parse(b.cursor);
  }
  if (next && next === currentPage) throw new ImportError("PAGINATION_LOOP");
  const records = rows.map((r) => {
    if (c.provider === "Mindbody") {
      if (c.operation === "clients")
        return base(
          c,
          "client",
          id.parse(r.Id),
          "Client reference",
          str(r.Status),
          r.LastModifiedDateTime,
        );
      return {
        ...base(
          c,
          "membership",
          `${c.clientId}:${id.parse(r.Id)}`,
          str(r.Name, "Membership pricing option"),
          typeof r.Current === "boolean"
            ? r.Current
              ? "Current"
              : "Not current"
            : "unknown",
          undefined,
        ),
        sourceSubjectId: c.clientId,
      };
    }
    if (c.provider === "Playpass")
      return {
        ...base(
          c,
          c.operation === "registrations" ? "registration" : "program",
          id.parse(r.id),
          c.operation === "registrations"
            ? "Organizer registration"
            : str(r.name, "League schedule"),
          str(r.status),
          undefined,
        ),
        ...(c.operation === "registrations" &&
        r.activity &&
        typeof r.activity === "object" &&
        "id" in r.activity
          ? { programId: id.parse(r.activity.id) }
          : {}),
      };
    const kind =
      c.operation === "customers"
        ? "client"
        : c.operation === "locations"
          ? "location"
          : "transaction";
    return {
      ...base(
        c,
        kind,
        id.parse(r.id),
        c.operation === "customers"
          ? "Customer reference"
          : c.operation === "locations"
            ? str(r.name, "Location")
            : `${c.operation === "payments" ? "Payment" : "Order"} status reference`,
        str(r.status ?? r.state),
        r.updated_at,
      ),
      ...(typeof r.location_id === "string" ? { location: r.location_id } : {}),
      ...(typeof r.customer_id === "string"
        ? { sourceSubjectId: r.customer_id }
        : {}),
    };
  });
  return { records, next };
}
export async function readContract(
  c: ReadContext,
  transport: Transport,
  options: {
    sleep?: (ms: number) => Promise<void>;
    timeoutMs?: number;
    random?: () => number;
    maxDelayMs?: number;
  } = {},
) {
  if (c.mode === "live") throw new ImportError("LIVE_DISABLED");
  if (!c.organizationId || !c.account) throw new ImportError("SCOPE_REQUIRED");
  if (c.mode === "sandbox" && c.provider === "Playpass")
    throw new ImportError("NO_VERIFIED_PLAYPASS_SANDBOX");
  if (c.mode === "sandbox" && c.provider === "Mindbody" && c.account !== "-99")
    throw new ImportError("SANDBOX_SITE_REQUIRED");
  const all: Record<string, SourceRecord> = {},
    seen = new Set<string>();
  let page = "",
    pages = 0;
  const now = c.now ?? Date.now,
    startedAt = now(),
    sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  do {
    if (++pages > 100 || seen.has(page))
      throw new ImportError("PAGINATION_BOUND");
    seen.add(page);
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        response = await Promise.race([
          transport({ ...definition(c, page), signal: controller.signal }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new ImportError("TIMEOUT"));
            }, options.timeoutMs ?? 8000);
          }),
        ]);
      } catch {
        if (attempt === 2) throw new ImportError("TIMEOUT_OR_NETWORK");
        response = { status: 503, body: {} };
      } finally {
        clearTimeout(timer);
      }
      if (response.status === 401)
        throw new ImportError("ACCESS_EXPIRED_OR_REVOKED");
      if (response.status === 403) throw new ImportError("ACCESS_DENIED");
      if (response.status < 400) break;
      if (response.status !== 429 && response.status < 500)
        throw new ImportError("REQUEST_REJECTED");
      const raw =
        response.headers?.["retry-after"] ?? response.headers?.["Retry-After"];
      const ms =
        raw !== undefined
          ? Number.isFinite(Number(raw))
            ? Math.max(0, Number(raw) * 1000)
            : Math.max(0, Date.parse(raw) - now())
          : 250 * 2 ** attempt + (options.random ?? Math.random)() * 100;
      if (
        attempt === 2 ||
        !Number.isFinite(ms) ||
        ms > (options.maxDelayMs ?? 10000)
      )
        throw new ImportError(
          response.status === 429 ? "RATE_LIMITED" : "SOURCE_UNAVAILABLE",
          Number.isFinite(ms) ? new Date(now() + ms).toISOString() : undefined,
        );
      await sleep(ms);
    }
    if (!response) throw new ImportError("SOURCE_UNAVAILABLE");
    try {
      const result = decode(c, response.body, page);
      for (const r of result.records) all[recordKey(r)] = r;
      page = result.next;
    } catch (e) {
      if (e instanceof ImportError) throw e;
      throw new ImportError("CONTRACT_INVALID");
    }
  } while (page);
  return {
    records: Object.values(all),
    pages,
    checkpoint: new Date(startedAt).toISOString(),
    evidence: "contract/fixture or sandbox read; not live verification",
  };
}
/** No production endpoint or write transport exists. Only explicitly enabled Square Sandbox reads. */
export function squareSandboxTransport(enabled: boolean): Transport {
  return async (req) => {
    if (!enabled) throw new ImportError("SANDBOX_NOT_ENABLED");
    const url = new URL(req.path, "https://connect.squareupsandbox.com");
    if (
      url.origin !== "https://connect.squareupsandbox.com" ||
      !(
        (req.method === "GET" &&
          ["/v2/customers", "/v2/locations", "/v2/payments"].includes(
            url.pathname,
          )) ||
        (req.method === "POST" && url.pathname === "/v2/orders/search")
      )
    )
      throw new ImportError("ENDPOINT_DENIED");
    const response = await fetch(url, {
      method: req.method,
      headers: { ...req.headers, "Content-Type": "application/json" },
      body: req.body ? JSON.stringify(req.body) : undefined,
      signal: req.signal,
      redirect: "error",
    });
    return {
      status: response.status,
      headers: (response.headers.has("retry-after")
        ? { "retry-after": response.headers.get("retry-after")! }
        : {}) as Record<string, string>,
      body: await response.json(),
    };
  };
}
export function mindbodySandboxTransport(enabled: boolean): Transport {
  return async (req) => {
    if (!enabled || req.method !== "GET" || req.headers.SiteId !== "-99")
      throw new ImportError("SANDBOX_NOT_ENABLED");
    const url = new URL(req.path, "https://api.mindbodyonline.com");
    if (
      url.origin !== "https://api.mindbodyonline.com" ||
      ![
        "/public/v6/client/clients",
        "/public/v6/client/activeclientmemberships",
      ].includes(url.pathname)
    )
      throw new ImportError("ENDPOINT_DENIED");
    const response = await fetch(url, {
      headers: req.headers,
      signal: req.signal,
      redirect: "error",
    });
    return {
      status: response.status,
      headers: (response.headers.has("retry-after")
        ? { "retry-after": response.headers.get("retry-after")! }
        : {}) as Record<string, string>,
      body: await response.json(),
    };
  };
}
