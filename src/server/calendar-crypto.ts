/**
 * calendar-crypto.ts
 *
 * AES-256-GCM authenticated encryption for iCal feed URLs.
 * Each encrypt() call produces a fresh random IV so two encryptions of the
 * same URL produce different ciphertexts — no deterministic leakage.
 *
 * Storage format (JSON, stored in sc_calendar_feeds.encrypted_url):
 *   { iv: "<hex>", authTag: "<hex>", ciphertext: "<hex>" }
 *
 * The raw URL is NEVER returned to the browser. Only the server decrypts it
 * immediately before fetching the feed, and the plaintext is discarded
 * after the fetch completes.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getSecret } from '#airo/secrets';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = getSecret('FEED_ENCRYPTION_KEY');
  const hex = typeof raw === 'string' ? raw : '';
  if (!hex || hex.length !== 64) {
    throw new Error(
      'FEED_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return Buffer.from(hex, 'hex');
}

export interface EncryptedPayload {
  iv: string;
  authTag: string;
  ciphertext: string;
}

/** Encrypt a plaintext URL. Returns a JSON-serialisable payload. */
export function encryptUrl(plaintext: string): EncryptedPayload {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV — GCM standard
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted.toString('hex'),
  };
}

/** Decrypt a payload produced by encryptUrl(). Throws on tampered data. */
export function decryptUrl(payload: EncryptedPayload): string {
  const key = getKey();
  const decipher = createDecipheriv(
    ALGO,
    key,
    Buffer.from(payload.iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/** Serialise to the string stored in the DB column. */
export function serializePayload(payload: EncryptedPayload): string {
  return JSON.stringify(payload);
}

/** Deserialise from the DB column string. Throws on malformed JSON. */
export function deserializePayload(stored: string): EncryptedPayload {
  const p = JSON.parse(stored) as Partial<EncryptedPayload>;
  if (!p.iv || !p.authTag || !p.ciphertext) {
    throw new Error('Invalid encrypted payload structure');
  }
  return p as EncryptedPayload;
}
