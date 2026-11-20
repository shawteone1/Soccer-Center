import { z } from "zod";
import { createHash } from "node:crypto";
import { PilotDatabase } from "./database";
import { setupOf } from "../pilot";
import { opaque, digest } from "./security";
export interface OAuthConfig {
  clientId: string;
  redirectUri: string;
}
export type TokenTransport = (body: Record<string, string>) => Promise<unknown>;
const tokens = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.string().datetime(),
  merchant_id: z.string().min(1),
});
export class SquareOAuth {
  constructor(
    private db: PilotDatabase,
    private config: OAuthConfig,
    private exchange: TokenTransport,
  ) {}
  begin(session: string, org: string) {
    const user = this.db.session(session).user_id;
    if (this.db.role(user, org) !== "admin") throw new Error("FORBIDDEN");
    const redirect = new URL(this.config.redirectUri);
    if (
      redirect.origin !== "http://127.0.0.1:5188" ||
      redirect.pathname !== "/pilot-api/oauth/square/callback" ||
      !this.config.clientId
    )
      throw new Error("OAUTH_CONFIGURATION_REQUIRED");
    const selection = setupOf(this.db.state(user, org).state).connections
      .Square;
    if (selection.mode !== "sandbox" || !selection.selected)
      throw new Error("SANDBOX_SETTINGS_REQUIRED");
    const categories = setupOf(this.db.state(user, org).state).connections
      .Square.categories;
    const scopes = [
      "MERCHANT_PROFILE_READ",
      ...(categories.includes("customers") ? ["CUSTOMERS_READ"] : []),
      ...(categories.includes("commerce")
        ? ["ORDERS_READ", "PAYMENTS_READ"]
        : []),
    ];
    const state = opaque(),
      verifier = opaque(),
      challenge = createHash("sha256").update(verifier).digest("base64url");
    this.db.db
      .prepare("INSERT INTO oauth VALUES(?,?,?,?,?)")
      .run(
        digest(state),
        digest(session),
        org,
        Date.now() + 300000,
        this.db.vault.seal(
          { verifier, redirectUri: this.config.redirectUri },
          org,
        ),
      );
    const url = new URL("https://connect.squareupsandbox.com/oauth2/authorize");
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      scope: scopes.join(" "),
      state,
      redirect_uri: this.config.redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    return { url: url.toString() };
  }
  deny(session: string, state: string) {
    const row = this.db.db
      .prepare("SELECT * FROM oauth WHERE state_hash=?")
      .get(digest(state)) as
      { session_hash: string; org_id: string; expires: number } | undefined;
    if (
      !row ||
      row.expires < Date.now() ||
      row.session_hash !== digest(session)
    )
      throw new Error("OAUTH_STATE_INVALID");
    const user = this.db.session(session).user_id;
    if (this.db.role(user, row.org_id) !== "admin")
      throw new Error("FORBIDDEN");
    this.db.db
      .prepare("DELETE FROM oauth WHERE state_hash=?")
      .run(digest(state));
    const snapshot = this.db.state(user, row.org_id);
    this.db.mutate(user, row.org_id, snapshot.revision, {
      type: "connection",
      provider: "Square",
      action: "denied",
    });
    return { authorization: "denied", organizationId: row.org_id };
  }
  async callback(session: string, state: string, code: string) {
    const row = this.db.db
      .prepare("SELECT * FROM oauth WHERE state_hash=?")
      .get(digest(state)) as
      | {
          session_hash: string;
          org_id: string;
          expires: number;
          envelope: string;
        }
      | undefined;
    if (
      !row ||
      row.expires < Date.now() ||
      row.session_hash !== digest(session)
    )
      throw new Error("OAUTH_STATE_INVALID");
    const user = this.db.session(session).user_id;
    if (this.db.role(user, row.org_id) !== "admin")
      throw new Error("FORBIDDEN");
    this.db.db
      .prepare("DELETE FROM oauth WHERE state_hash=?")
      .run(digest(state));
    const pending = this.db.vault.open(row.envelope, row.org_id);
    const value = tokens.parse(
      await this.exchange({
        grant_type: "authorization_code",
        client_id: this.config.clientId,
        code,
        code_verifier: pending.verifier,
        redirect_uri: pending.redirectUri,
      }),
    );
    this.db.putSecret(row.org_id, "Square", value.merchant_id, value);
    const snapshot = this.db.state(user, row.org_id),
      setup = structuredClone(setupOf(snapshot.state));
    setup.connections.Square.account = value.merchant_id;
    setup.connections.Square.authorization = "unverified";
    this.db.mutate(user, row.org_id, snapshot.revision, {
      type: "setup",
      setup,
    });
    return {
      organizationId: row.org_id,
      account: value.merchant_id,
      authorization: "unverified",
      next: "Validate authorized account and permitted locations with an approved sandbox read.",
    };
  }
  async refresh(org: string, account: string) {
    const previous = this.db.getSecret(org, "Square", account);
    if (!previous) throw new Error("CREDENTIAL_REQUIRED");
    const value = tokens.parse(
      await this.exchange({
        grant_type: "refresh_token",
        client_id: this.config.clientId,
        refresh_token: previous.refresh_token,
      }),
    );
    if (value.merchant_id !== account) throw new Error("ACCOUNT_MISMATCH");
    this.db.putSecret(org, "Square", account, value);
    return { expiresAt: value.expires_at };
  }
}
export function sandboxTokenExchange(enabled: boolean): TokenTransport {
  return async (body) => {
    if (!enabled) throw new Error("SANDBOX_NOT_ENABLED");
    const response = await fetch(
      "https://connect.squareupsandbox.com/oauth2/token",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new Error("OAUTH_EXCHANGE_FAILED");
    return response.json();
  };
}
