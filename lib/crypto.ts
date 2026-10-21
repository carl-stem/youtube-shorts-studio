// AES-256-GCM encryption for values stored at rest (OAuth tokens in KV).
// Pure Node `crypto`; no relative runtime imports so tests can load it directly.
//
// Format: `v1:<iv>:<tag>:<ciphertext>` (each base64). The version prefix lets a future
// format or key rotation coexist with v1 values; unprefixed values are legacy plaintext.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const ENCRYPTION_PREFIX = 'v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;   // GCM standard nonce size
const TAG_BYTES = 16;

/** Decodes a base64 TOKEN_ENC_KEY. Returns null unless it is exactly 32 bytes. */
export function parseEncryptionKey(raw: string | undefined): Buffer | null {
  if (!raw || !raw.trim()) return null;
  const key = Buffer.from(raw.trim(), 'base64');
  return key.length === 32 ? key : null;
}

export function encryptString(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/** Throws if the payload is malformed, was tampered with, or was sealed with another key. */
export function decryptString(payload: string, key: Buffer): string {
  if (!payload.startsWith(ENCRYPTION_PREFIX)) throw new Error('Unsupported encrypted value format');
  const parts = payload.slice(ENCRYPTION_PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted value');
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'));
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('Malformed encrypted value');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function isEncryptedValue(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}

export type TokenEncryptionMode = 'encrypt' | 'plaintext' | 'refuse';

/** Production must never store plaintext tokens; development may, with a warning. */
export function tokenEncryptionMode(key: Buffer | null, nodeEnv: string | undefined): TokenEncryptionMode {
  if (key) return 'encrypt';
  return nodeEnv === 'production' ? 'refuse' : 'plaintext';
}

/** Encrypts a JSON-serializable value, or returns it unchanged when no key is given. */
export function sealJson(value: unknown, key: Buffer | null): unknown {
  return key ? encryptString(JSON.stringify(value), key) : value;
}

export interface OpenedValue<T> {
  value: T | null;
  /** Stored without encryption (pre-encryption data); callers should re-save it sealed. */
  legacyPlaintext: boolean;
  /** Encrypted, but could not be decrypted (missing/wrong key or tampering). */
  undecryptable: boolean;
}

export function openJson<T>(stored: unknown, key: Buffer | null): OpenedValue<T> {
  if (stored === null || stored === undefined) return { value: null, legacyPlaintext: false, undecryptable: false };
  // Casts below mirror kvGet<T>: only this app writes these keys, always with a T.
  if (!isEncryptedValue(stored)) return { value: stored as T, legacyPlaintext: true, undecryptable: false };
  if (!key) return { value: null, legacyPlaintext: false, undecryptable: true };
  try {
    return { value: JSON.parse(decryptString(stored, key)) as T, legacyPlaintext: false, undecryptable: false };
  } catch {
    return { value: null, legacyPlaintext: false, undecryptable: true };
  }
}
