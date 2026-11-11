// @vitest-environment node
import express from "express";
import { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";

import { renderSsrDocument, registerAdSenseTextRoutes } from "./ssr-document";

const publisherId = "ca-pub-1234567890123456";
const canonicalScript = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}" crossorigin="anonymous"></script>`;

// ---------------------------------------------------------------------------
// Minimal in-process HTTP helper — no TCP socket required.
// Overrides res.write/end to capture output; invokes app.handle() directly.
// ---------------------------------------------------------------------------
interface MockResponse {
	status: number;
	headers: Record<string, string>;
	body: string;
}

function callApp(app: express.Express, method: string, path: string): Promise<MockResponse> {
	return new Promise((resolve, reject) => {
		const reqStream = new Readable({ read() {} });
		const req = new IncomingMessage(reqStream as never);
		req.method = method;
		req.url = path;
		req.headers = {};
		reqStream.push(null);

		const res = new ServerResponse(req);
		const chunks: Buffer[] = [];

		const original_write = res.write.bind(res);
		const original_end = res.end.bind(res);

		(res as unknown as { write: (...args: unknown[]) => boolean }).write = (
			chunk: unknown,
			...rest: unknown[]
		): boolean => {
			if (chunk != null) {
				chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
			}
			return original_write(chunk as never, ...(rest as never[]));
		};

		(res as unknown as { end: (...args: unknown[]) => ServerResponse }).end = (
			chunk?: unknown,
			...rest: unknown[]
		): ServerResponse => {
			if (chunk != null) {
				chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
			}
			const body = Buffer.concat(chunks).toString("utf8");
			const headers: Record<string, string> = {};
			for (const [k, v] of Object.entries(res.getHeaders())) {
				if (v !== undefined) {
					headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
				}
			}
			resolve({ status: res.statusCode, headers, body });
			return original_end(chunk as never, ...(rest as never[]));
		};

		(app as unknown as { handle: (req: unknown, res: unknown, next: (err?: unknown) => void) => void }).handle(req, res, (err?: unknown) => {
			if (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
			} else {
				// No route matched — Express default 404.
				res.statusCode = 404;
				res.end();
			}
		});
	});
}

// Thin wrapper that mirrors the fetch Response API used by the tests.
async function appFetch(
	app: express.Express,
	path: string,
): Promise<{
	status: number;
	headers: { get(k: string): string | null };
	text(): Promise<string>;
}> {
	const result = await callApp(app, "GET", path);
	return {
		status: result.status,
		headers: {
			get(k: string): string | null {
				return result.headers[k.toLowerCase()] ?? null;
			},
		},
		text(): Promise<string> {
			return Promise.resolve(result.body);
		},
	};
}

describe("entry AdSense text routes", () => {
	it("serves enabled ads.txt as text/plain with no-cache", async () => {
		const app = express();
		registerAdSenseTextRoutes(app, {
			publisherId: null,
			scriptHtml: "",
			adsTxt: "google.com, pub-123, DIRECT, f08c47fec0942fa0",
			appAdsTxt: null,
		});

		const response = await appFetch(app, "/ads.txt");

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/plain");
		expect(response.headers.get("cache-control")).toBe("no-cache");
		expect(await response.text()).toBe("google.com, pub-123, DIRECT, f08c47fec0942fa0");
	});

	it("serves enabled app-ads.txt as text/plain with no-cache", async () => {
		const app = express();
		registerAdSenseTextRoutes(app, {
			publisherId: null,
			scriptHtml: "",
			adsTxt: null,
			appAdsTxt: "google.com, pub-456, DIRECT, f08c47fec0942fa0",
		});

		const response = await appFetch(app, "/app-ads.txt");

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/plain");
		expect(response.headers.get("cache-control")).toBe("no-cache");
		expect(await response.text()).toBe("google.com, pub-456, DIRECT, f08c47fec0942fa0");
	});

	it("returns 404 for disabled AdSense text routes", async () => {
		const app = express();
		registerAdSenseTextRoutes(app, {
			publisherId: null,
			scriptHtml: "",
			adsTxt: null,
			appAdsTxt: null,
		});

		const adsTxt = await appFetch(app, "/ads.txt");
		const appAdsTxt = await appFetch(app, "/app-ads.txt");

		expect(adsTxt.status).toBe(404);
		expect(adsTxt.headers.get("content-type")).toContain("text/plain");
		expect(adsTxt.headers.get("cache-control")).toBe("no-cache");
		expect(appAdsTxt.status).toBe(404);
		expect(appAdsTxt.headers.get("content-type")).toContain("text/plain");
		expect(appAdsTxt.headers.get("cache-control")).toBe("no-cache");
	});
});

describe("entry SSR rendering", () => {
	it("appends the canonical AdSense script to existing head output", () => {
		const html = renderSsrDocument(
			"<html><head><!--app-head--></head><body><!--app-html--></body></html>",
			{
				head: "<title>Generated Site</title>",
				html: "<main>Rendered app</main>",
			},
			{
				scriptHtml: canonicalScript,
			},
		);

		expect(html).toContain(`<title>Generated Site</title>\n${canonicalScript}`);
		expect(html).toContain("<main>Rendered app</main>");
		expect(html).not.toContain("<!--app-head-->");
		expect(html).not.toContain("<!--app-html-->");
	});

	it("keeps SSR head output unchanged when AdSense script output is disabled", () => {
		const html = renderSsrDocument(
			"<html><head><!--app-head--></head><body><!--app-html--></body></html>",
			{
				head: "<title>Generated Site</title>",
				html: "<main>Rendered app</main>",
			},
			{
				scriptHtml: "",
			},
		);

		expect(html).toContain("<title>Generated Site</title>");
		expect(html).not.toContain("pagead2.googlesyndication.com");
		expect(html).toContain("<main>Rendered app</main>");
	});
});
