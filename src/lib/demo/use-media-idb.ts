/**
 * Portal Demo — IndexedDB media storage.
 *
 * Stores actual file blobs (photos and videos) in IndexedDB so they never
 * touch localStorage. Metadata (title, kind, game tag, season, assignments)
 * continues to live in localStorage via use-portal-demo.ts.
 *
 * DB name  : sc_demo_media
 * Version  : 1
 * Stores   :
 *   blobs        — { id: string, blob: Blob, mimeType: string }
 *   collections  — { id: string, name: string, itemIds: string[], createdAt: string }
 *
 * All IDs are stable strings generated at upload time.
 * reset() deletes every record from both stores.
 *
 * STORAGE NOTES (shown to users in the UI):
 *   - Media stays on this browser/device only.
 *   - IndexedDB is cleared when the user clears site data in browser settings.
 *   - Typical quota: 50 % of available disk space (Chrome/Edge), 1 GB (Firefox).
 *   - No files are uploaded to a server in this demo.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaBlob {
  id: string;
  blob: Blob;
  mimeType: string;
}

export interface DemoCollection {
  id: string;
  name: string;
  /** Ordered list of media item IDs (metadata IDs, not blob IDs — they match) */
  itemIds: string[];
  createdAt: string;
}

// ─── DB bootstrap ─────────────────────────────────────────────────────────────

const DB_NAME    = 'sc_demo_media';
const DB_VERSION = 1;
const STORE_BLOBS       = 'blobs';
const STORE_COLLECTIONS = 'collections';

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_COLLECTIONS)) {
        db.createObjectStore(STORE_COLLECTIONS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

// ─── Blob helpers ─────────────────────────────────────────────────────────────

export async function idbPutBlob(entry: MediaBlob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    tx.objectStore(STORE_BLOBS).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function idbGetBlob(id: string): Promise<MediaBlob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_BLOBS, 'readonly');
    const req = tx.objectStore(STORE_BLOBS).get(id);
    req.onsuccess = () => resolve((req.result as MediaBlob) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbDeleteBlob(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    tx.objectStore(STORE_BLOBS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function idbGetAllBlobIds(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_BLOBS, 'readonly');
    const req = tx.objectStore(STORE_BLOBS).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror   = () => reject(req.error);
  });
}

// ─── Collection helpers ───────────────────────────────────────────────────────

export async function idbPutCollection(col: DemoCollection): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COLLECTIONS, 'readwrite');
    tx.objectStore(STORE_COLLECTIONS).put(col);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function idbGetAllCollections(): Promise<DemoCollection[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_COLLECTIONS, 'readonly');
    const req = tx.objectStore(STORE_COLLECTIONS).getAll();
    req.onsuccess = () => resolve(req.result as DemoCollection[]);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbDeleteCollection(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COLLECTIONS, 'readwrite');
    tx.objectStore(STORE_COLLECTIONS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ─── Reset ────────────────────────────────────────────────────────────────────

/** Delete all blobs and collections. Called by demo reset. */
export async function idbResetAll(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_BLOBS, STORE_COLLECTIONS], 'readwrite');
    tx.objectStore(STORE_BLOBS).clear();
    tx.objectStore(STORE_COLLECTIONS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ─── Object URL cache ─────────────────────────────────────────────────────────
// Keeps one revocable URL per blob ID so we don't create a new URL on every render.

const _urlCache = new Map<string, string>();

export async function getBlobUrl(id: string): Promise<string | null> {
  if (_urlCache.has(id)) return _urlCache.get(id)!;
  const entry = await idbGetBlob(id);
  if (!entry) return null;
  const url = URL.createObjectURL(entry.blob);
  _urlCache.set(id, url);
  return url;
}

export function revokeBlobUrl(id: string): void {
  const url = _urlCache.get(id);
  if (url) { URL.revokeObjectURL(url); _urlCache.delete(id); }
}
