import { useEffect, useState, type ReactNode } from "react";
import type { State } from "./model";
export interface BackendSession {
  user: string;
  csrf: string;
  role: "admin" | "operator" | "viewer";
  revision: number;
  organization: string;
  state: State;
}
export default function PilotGate({
  children,
}: {
  children: (session: BackendSession) => ReactNode;
}) {
  const [user, setUser] = useState(""),
    [password, setPassword] = useState(""),
    [organization, setOrganization] = useState(""),
    [csrf, setCsrf] = useState(""),
    [session, setSession] = useState<BackendSession | null>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/pilot-api/session")
      .then(async (r) => {
        if (r.ok) {
          const s = await r.json();
          setUser(s.user);
          setCsrf(s.csrf);
        }
      })
      .catch(() =>
        setMessage("Start the isolated local backend on port 5188."),
      );
  }, []);
  async function signIn() {
    try {
      let token = csrf;
      if (!token) {
        const r = await fetch("/pilot-api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: user, password }),
        });
        const data = await r.json();
        setPassword("");
        if (!r.ok) throw new Error(data.error);
        token = data.csrf;
        setCsrf(token);
      }
      const r = await fetch(
        `/pilot-api/orgs/${encodeURIComponent(organization)}/state`,
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setSession({ ...data, user, csrf: token, organization });
      setMessage("");
    } catch (e) {
      setPassword("");
      setMessage(e instanceof Error ? e.message : "Access denied");
    }
  }
  if (session) return children(session);
  return (
    <main className="panel pilot-login">
      <h1>Soccer City Operations Desk</h1>
      <p>
        Isolated staff backend foundation · fictional data only. No default
        accounts, demo authentication or provider access.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void signIn();
        }}
      >
        <label>
          Staff username
          <input
            autoComplete="username"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            required
          />
        </label>
        {!csrf && (
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        )}
        <label>
          Organization ID
          <input
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            required
            pattern="[a-zA-Z0-9_-]{1,60}"
          />
        </label>
        <button className="primary">
          {csrf ? "Open authorized organization" : "Sign in locally"}
        </button>
      </form>
      {message && <p role="alert">{message}</p>}
      <p>
        Accounts and organization memberships must be explicitly provisioned
        through the local CLI. Never enter provider credentials here.
      </p>
    </main>
  );
}
