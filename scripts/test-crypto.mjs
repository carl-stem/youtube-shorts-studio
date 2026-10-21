import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  ENCRYPTION_PREFIX, decryptString, encryptString, isEncryptedValue, openJson, parseEncryptionKey, sealJson, tokenEncryptionMode,
} from '../lib/crypto.ts';

const key = randomBytes(32);
const tokens = { accessToken: 'ya29.secret', refreshToken: '1//refresh', expiresAt: 1_800_000_000_000, channelName: 'Chan' };

test('parses only 32-byte base64 keys', () => {
  assert.deepEqual(parseEncryptionKey(key.toString('base64')), key);
  assert.equal(parseEncryptionKey(undefined), null);
  assert.equal(parseEncryptionKey('  '), null);
  assert.equal(parseEncryptionKey(randomBytes(16).toString('base64')), null);
});

test('roundtrips with a versioned prefix and random IV', () => {
  const a = encryptString('hello', key);
  const b = encryptString('hello', key);
  assert.ok(a.startsWith(ENCRYPTION_PREFIX));
  assert.notEqual(a, b);
  assert.ok(!a.includes('hello'));
  assert.equal(decryptString(a, key), 'hello');

  const sealed = sealJson(tokens, key);
  assert.ok(isEncryptedValue(sealed));
  assert.ok(!String(sealed).includes('ya29.secret'));
  assert.deepEqual(openJson(sealed, key), { value: tokens, legacyPlaintext: false, undecryptable: false });
});

test('detects tampering with ciphertext, tag or IV', () => {
  const sealed = encryptString(JSON.stringify(tokens), key);
  const [iv, tag, ct] = sealed.slice(ENCRYPTION_PREFIX.length).split(':');
  const flip = (b64) => { const buf = Buffer.from(b64, 'base64'); buf[0] ^= 1; return buf.toString('base64'); };
  for (const tampered of [
    `${ENCRYPTION_PREFIX}${iv}:${tag}:${flip(ct)}`,
    `${ENCRYPTION_PREFIX}${iv}:${flip(tag)}:${ct}`,
    `${ENCRYPTION_PREFIX}${flip(iv)}:${tag}:${ct}`,
    `${ENCRYPTION_PREFIX}${iv}:${tag}`,
  ]) {
    assert.throws(() => decryptString(tampered, key));
    assert.deepEqual(openJson(tampered, key), { value: null, legacyPlaintext: false, undecryptable: true });
  }
});

test('refuses to decrypt with the wrong key or no key', () => {
  const sealed = sealJson(tokens, key);
  assert.throws(() => decryptString(String(sealed), randomBytes(32)));
  assert.equal(openJson(sealed, randomBytes(32)).value, null);
  assert.equal(openJson(sealed, null).undecryptable, true);
});

test('legacy plaintext values pass through and are flagged for re-encryption', () => {
  assert.deepEqual(openJson(tokens, key), { value: tokens, legacyPlaintext: true, undecryptable: false });
  assert.deepEqual(openJson(tokens, null), { value: tokens, legacyPlaintext: true, undecryptable: false });
  assert.deepEqual(openJson(null, key), { value: null, legacyPlaintext: false, undecryptable: false });
  assert.equal(sealJson(tokens, null), tokens);
});

test('production refuses plaintext storage; development allows it', () => {
  assert.equal(tokenEncryptionMode(key, 'production'), 'encrypt');
  assert.equal(tokenEncryptionMode(null, 'production'), 'refuse');
  assert.equal(tokenEncryptionMode(null, 'development'), 'plaintext');
});
