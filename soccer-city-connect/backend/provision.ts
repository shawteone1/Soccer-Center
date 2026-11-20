import { developmentPath } from "./config";
import { PilotDatabase } from "./database";
const password = process.env.SCC_BOOTSTRAP_PASSWORD,
  user = process.env.SCC_BOOTSTRAP_USER,
  org = process.env.SCC_BOOTSTRAP_ORG,
  role = process.env.SCC_BOOTSTRAP_ROLE;
if (
  !password ||
  !user ||
  !org ||
  !role ||
  !["admin", "operator", "viewer"].includes(role)
)
  throw new Error("EXPLICIT_USER_PASSWORD_ORG_ROLE_REQUIRED");
const db = new PilotDatabase(developmentPath(process.env.SCC_DB_PATH));
try {
  db.provision(org, user, password, role as "admin" | "operator" | "viewer");
  console.log(
    "Local staff membership provisioned; all existing sessions revoked. No credentials printed.",
  );
} finally {
  db.close();
}
