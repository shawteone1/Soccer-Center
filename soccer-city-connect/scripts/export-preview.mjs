import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url),
  build = new URL("build/", root);
let html = readFileSync(new URL("index.html", build), "utf8");
html = html.replace(
  /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (_tag, asset) =>
    `<style>${readFileSync(new URL(asset.replace(/^\//, ""), build), "utf8")}</style>`,
);
html = html.replace(
  /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_tag, asset) => {
    const js = readFileSync(
      new URL(asset.replace(/^\//, ""), build),
      "utf8",
    ).replace(/<\/script/gi, "<\\/script");
    return `<script>if(!location.hash)location.hash='admin';</script><script type="module">${js}</script>`;
  },
);
html = html.replace(
  "<title>Soccer City Connect — Fictional demonstration</title>",
  "<title>Soccer City Operations Desk — powered by PlayRcmd</title>",
);
if (
  /node:sqlite|node:crypto|SCC_MASTER_KEY_FILE|BEGIN (?:RSA |EC )?PRIVATE KEY/.test(
    html,
  )
) {
  throw new Error("SERVER_CODE_OR_KEY_MATERIAL_IN_PREVIEW");
}
const destination = new URL("artifacts/operations-desk-preview.html", root);
writeFileSync(destination, html);
console.log(`Exported self-contained preview: ${fileURLToPath(destination)}`);
