import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
/** Runtime/CLI paths are deliberately restricted to isolated local development storage. */
export function developmentPath(value?: string) {
  const root = fileURLToPath(new URL("../.pilot/", import.meta.url)),
    path = resolve(value ?? resolve(root, "development.sqlite"));
  if (
    !path.endsWith(".sqlite") ||
    ![resolve(root) + sep, resolve(tmpdir()) + sep].some((prefix) =>
      path.startsWith(prefix),
    )
  )
    throw new Error("ISOLATED_DEVELOPMENT_DATABASE_REQUIRED");
  return path;
}
