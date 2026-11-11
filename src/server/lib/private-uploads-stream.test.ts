/**
 * private-uploads-stream.test.ts
 *
 * Unit tests for the streamFile helper in private-uploads.ts.
 * Tests HTTP Range request support (206 Partial Content) and full-file
 * delivery (200 OK).
 *
 * Uses a real temp file so node:fs does not need to be mocked.
 * The file is written to /tmp/ and left there (/tmp/ is ephemeral).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Response } from 'express';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { streamFile, resolveUploadPath } from '../../server/lib/private-uploads';

// ── Temp file ─────────────────────────────────────────────────────────────────

const TEST_DIR = mkdtempSync(join(tmpdir(), 'sc-stream-'));
const TEST_FILE = join(TEST_DIR, 'test.mp4');
afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));
const FILE_SIZE = 10_000;
const FILE_CONTENT = Buffer.alloc(FILE_SIZE, 0x42); // 10 KB of 0x42

beforeAll(() => {
  writeFileSync(TEST_FILE, FILE_CONTENT);
});

// ── Mock response helper ──────────────────────────────────────────────────────

function mockRes(rangeHeader?: string) {
  let writtenCode = 0;
  let writtenHeaders: Record<string, unknown> = {};
  let statusCode = 200;
  const setHeaders: Record<string, unknown> = {};

  const res = {
    writeHead(code: number, hdrs: Record<string, unknown>) {
      writtenCode = code;
      writtenHeaders = { ...hdrs };
    },
    setHeader(k: string, v: unknown) { setHeaders[k] = v; },
    status(code: number) { statusCode = code; return res; },
    end() { return res; },
    req: { headers: rangeHeader ? { range: rangeHeader } : {} },
    // Make res act as a writable stream so createReadStream().pipe(res) works
    write(_chunk: unknown) { return true; },
    on: () => res,
    once: () => res,
    emit: () => false,
    removeListener: () => res,
    writable: true,
    _writtenCode:    () => writtenCode,
    _writtenHeaders: () => writtenHeaders,
    _statusCode:     () => statusCode,
    _setHeaders:     () => setHeaders,
  };

  return res as unknown as Response & {
    _writtenCode(): number;
    _writtenHeaders(): Record<string, unknown>;
    _statusCode(): number;
    _setHeaders(): Record<string, unknown>;
    end(): typeof res;
  };
}

// Wrap a streamFile call in a Promise that resolves when the stream ends
function streamAndWait(
  file: string,
  rangeHeader?: string,
  opts: { isVideo?: boolean; cacheSeconds?: number; noStore?: boolean } = {},
): Promise<ReturnType<typeof mockRes>> {
  return new Promise((resolve) => {
    const res = mockRes(rangeHeader);
    // Override end() to resolve the promise
    const originalEnd = res.end.bind(res);
    (res as unknown as { end: () => typeof res }).end = () => {
      originalEnd();
      resolve(res);
      return res;
    };
    streamFile(file, res, opts);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('streamFile — HTTP Range requests', () => {
  it('responds with 206 and correct Content-Range when Range header is present', async () => {
    const res = await streamAndWait(TEST_FILE, 'bytes=0-1023', { isVideo: true });
    expect(res._writtenCode()).toBe(206);
    expect(res._writtenHeaders()['Content-Range']).toBe(`bytes 0-1023/${FILE_SIZE}`);
    expect(res._writtenHeaders()['Content-Length']).toBe(1024);
    expect(res._writtenHeaders()['Content-Type']).toBe('video/mp4');
  });

  it('responds with 206 for an open-ended range (bytes=2048-)', async () => {
    const res = await streamAndWait(TEST_FILE, 'bytes=2048-', { isVideo: true });
    expect(res._writtenCode()).toBe(206);
    expect(res._writtenHeaders()['Content-Range']).toBe(`bytes 2048-${FILE_SIZE - 1}/${FILE_SIZE}`);
    expect(res._writtenHeaders()['Content-Length']).toBe(FILE_SIZE - 2048);
  });

  it('responds with 200 and full file when no Range header is present', async () => {
    const res = await streamAndWait(TEST_FILE, undefined, { isVideo: false });
    expect(res._writtenCode()).toBe(200);
    expect(res._writtenHeaders()['Content-Length']).toBe(FILE_SIZE);
  });

  it('includes Accept-Ranges: bytes header for video full-file responses', async () => {
    const res = await streamAndWait(TEST_FILE, undefined, { isVideo: true });
    expect(res._writtenCode()).toBe(200);
    expect(res._writtenHeaders()['Accept-Ranges']).toBe('bytes');
  });

  it('responds with 404 when the file does not exist', () => {
    const res = mockRes();
    streamFile('/tmp/sc-nonexistent-file-xyz.mp4', res, { isVideo: false });
    expect(res._statusCode()).toBe(404);
  });

  it('sets Cache-Control: private header', async () => {
    const res = await streamAndWait(TEST_FILE, undefined, { isVideo: false, cacheSeconds: 300 });
    expect(res._setHeaders()['Cache-Control']).toBe('private, max-age=300');
  });

  it('sets Referrer-Policy: no-referrer header', async () => {
    const res = await streamAndWait(TEST_FILE, undefined, { isVideo: false });
    expect(res._setHeaders()['Referrer-Policy']).toBe('no-referrer');
  });
});

describe('streamFile regression cases', () => {
  it.each(['bytes=10000-', 'bytes=8-2', 'nonsense', 'bytes=-0', 'bytes='])('rejects invalid/unsatisfiable range %s', async (range) => {
    const res = await streamAndWait(TEST_FILE, range, { isVideo: true });
    expect(res._statusCode()).toBe(416);
    expect(res._setHeaders()['Content-Range']).toBe(`bytes */${FILE_SIZE}`);
  });
  it('supports suffix ranges', async () => {
    const res = await streamAndWait(TEST_FILE, 'bytes=-5', { isVideo: true });
    expect(res._writtenHeaders()['Content-Range']).toBe('bytes 9995-9999/10000');
    expect(res._writtenHeaders()['Content-Length']).toBe(5);
  });
  it('clamps end beyond EOF', async () => {
    const res = await streamAndWait(TEST_FILE, 'bytes=9995-20000', { isVideo: true });
    expect(res._writtenHeaders()['Content-Length']).toBe(5);
  });
  it('does not cache token-gated content', async () => {
    const res = await streamAndWait(TEST_FILE, undefined, { noStore: true });
    expect(res._setHeaders()['Cache-Control']).toBe('private, no-store');
  });
  it.each(['../../etc/passwd', '/etc/passwd', 'parent-media/../secret'])('rejects unsafe storage path %s', (path) => {
    expect(resolveUploadPath(path).found).toBe(false);
    expect(resolveUploadPath(path).path).toBe('');
  });
});

