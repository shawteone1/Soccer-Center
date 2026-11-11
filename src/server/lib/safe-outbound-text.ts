/** Bounded public-network text fetch, with DNS pinned for every redirect hop. */
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
const denied = new BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  denied.addSubnet(ip, bits, "ipv4");
for (const [ip, bits] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const)
  denied.addSubnet(ip, bits, "ipv6");
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !denied.check(address, "ipv4");
  // Only global-unicast v6; mapped v4, loopback, link-local and ULA fail closed.
  return (
    family === 6 &&
    /^[23][0-9a-f]{3}:/i.test(address) &&
    !denied.check(address, "ipv6")
  );
}
export function validateOutboundUrl(raw: string, allowHttp = false): URL {
  const url = new URL(raw);
  if (
    !(url.protocol === "https:" || (allowHttp && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("Unsupported feed URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host))
    throw new Error("Private network destinations are not allowed");
  return url;
}
export async function fetchPublicText(
  raw: string,
  options: {
    allowHttp?: boolean;
    maxBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
    headers?: Record<string, string>;
  } = {},
): Promise<string> {
  const {
    allowHttp = false,
    maxBytes = 2 * 1024 * 1024,
    timeoutMs = 30_000,
    maxRedirects = 3,
  } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortError = () => new Error("Feed request timed out");
  const work = async (): Promise<string> => {
    let url = validateOutboundUrl(raw, allowHttp);
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (controller.signal.aborted) throw abortError();
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(host)
        ? [{ address: host, family: isIP(host) }]
        : await lookup(host, { all: true, verbatim: true });
      if (controller.signal.aborted) throw abortError();
      if (
        !addresses.length ||
        addresses.some((a) => !isPublicAddress(a.address))
      )
        throw new Error("Private network destinations are not allowed");
      const pinned = addresses[0];
      const result = await new Promise<{ text?: string; location?: string }>(
        (resolve, reject) => {
          const request =
            url.protocol === "https:" ? httpsRequest : httpRequest;
          const req = request(
            url,
            {
              agent: false,
              family: pinned.family,
              signal: controller.signal,
              lookup: (_host, _opts, cb) =>
                cb(null, pinned.address, pinned.family),
              headers: {
                "User-Agent": "SoccerCenter/1.0",
                Accept:
                  "text/calendar,application/rss+xml,application/atom+xml,application/xml,text/plain,*/*;q=0.5",
                ...options.headers,
                "Accept-Encoding": "identity",
              },
            },
            (res) => {
              const status = res.statusCode ?? 0;
              if ([301, 302, 303, 307, 308].includes(status)) {
                const location = res.headers.location;
                res.destroy();
                if (!location)
                  reject(new Error("Feed redirect has no destination"));
                else resolve({ location });
                return;
              }
              if (status < 200 || status >= 300) {
                res.destroy();
                reject(new Error(`Feed returned HTTP ${status}`));
                return;
              }
              if (
                res.headers["content-encoding"] &&
                res.headers["content-encoding"] !== "identity"
              ) {
                res.destroy();
                reject(new Error("Unsupported feed encoding"));
                return;
              }
              let size = 0;
              const chunks: Buffer[] = [];
              res.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > maxBytes) {
                  req.destroy(new Error("Feed exceeds size limit"));
                  res.destroy();
                  reject(new Error("Feed exceeds size limit"));
                } else chunks.push(chunk);
              });
              res.on("end", () =>
                resolve({ text: Buffer.concat(chunks).toString("utf8") }),
              );
              res.on("error", reject);
              res.on("aborted", () =>
                reject(new Error("Feed response interrupted")),
              );
            },
          );
          req.on("error", reject);
          req.end();
        },
      );
      if (result.text !== undefined) return result.text;
      if (hop === maxRedirects) throw new Error("Too many feed redirects");
      url = validateOutboundUrl(
        new URL(result.location!, url).toString(),
        allowHttp,
      );
    }
    throw new Error("Unable to fetch feed");
  };
  let onAbort: () => void = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortError());
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([work(), deadline]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
