import { kvDel, kvGet, kvSet } from './kv';
import { cookies } from 'next/headers';
import { openJson, parseEncryptionKey, sealJson, tokenEncryptionMode } from './crypto';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;       // Unix ms
  scope?: string;
  channelName?: string;    // YouTube channel or TikTok username
  channelId?: string;
}

async function hasSession(sessionId: string): Promise<boolean> {
  const sessionCookie = cookies().get('oauth_session')?.value;
  return !!sessionCookie && sessionCookie === sessionId;
}

// ── Encryption at rest ────────────────────────────────────────────────────────

let plaintextWarned = false;

function encryptionKey(): Buffer | null {
  return parseEncryptionKey(process.env.TOKEN_ENC_KEY);
}

/** False when tokens must not be stored (production without a valid TOKEN_ENC_KEY). */
export function tokenEncryptionReady(): boolean {
  return tokenEncryptionMode(encryptionKey(), process.env.NODE_ENV) !== 'refuse';
}

async function writeTokens(key: string, t: OAuthTokens): Promise<boolean> {
  const encKey = encryptionKey();
  const mode = tokenEncryptionMode(encKey, process.env.NODE_ENV);
  if (mode === 'refuse') {
    console.error('[tokens] TOKEN_ENC_KEY missing or invalid; refusing to store plaintext tokens in production');
    return false;
  }
  if (mode === 'plaintext' && !plaintextWarned) {
    plaintextWarned = true;
    console.warn('[tokens] TOKEN_ENC_KEY not set; storing OAuth tokens unencrypted (development only)');
  }
  return kvSet(key, sealJson(t, encKey));
}

async function readTokens(key: string): Promise<OAuthTokens | null> {
  const encKey = encryptionKey();
  const opened = openJson<OAuthTokens>(await kvGet<unknown>(key), encKey);
  if (opened.undecryptable) console.error(`[tokens] could not decrypt ${key.split(':').slice(0, 2).join(':')} value; treating as disconnected`);
  // Lazy migration: legacy plaintext is returned as-is and re-saved sealed when a key exists.
  if (opened.legacyPlaintext && opened.value && encKey) await kvSet(key, sealJson(opened.value, encKey));
  return opened.value;
}

// ── Google ────────────────────────────────────────────────────────────────────

export async function getGoogleTokens(sessionId: string): Promise<OAuthTokens | null> {
  return readTokens(`tokens:google:${sessionId}`);
}

export async function setGoogleTokens(sessionId: string, t: OAuthTokens): Promise<boolean> {
  return writeTokens(`tokens:google:${sessionId}`, t);
}

export async function clearGoogleTokens(sessionId: string): Promise<void> {
  await kvDel(`tokens:google:${sessionId}`);
}

export async function getValidGoogleToken(sessionId: string): Promise<string | null> {
  if (!await hasSession(sessionId)) return null;
  const { kvGet } = await import('./kv');
  if (!await kvGet<{ createdAt: number }>(`oauth:session:${sessionId}`)) return null;
  const t = await getGoogleTokens(sessionId);
  if (!t) return null;
  if (Date.now() < t.expiresAt) return t.accessToken;
  if (!t.refreshToken || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: t.refreshToken,
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error_description || 'Refresh failed');
    const fresh: OAuthTokens = {
      ...t,
      accessToken: d.access_token,
      refreshToken: d.refresh_token || t.refreshToken,
      expiresAt: Date.now() + (d.expires_in - 60) * 1000,
    };
    if (!await setGoogleTokens(sessionId, fresh)) return null;
    return fresh.accessToken;
  } catch { return null; }
}

// ── TikTok ────────────────────────────────────────────────────────────────────

export async function getTikTokTokens(sessionId: string): Promise<OAuthTokens | null> {
  return readTokens(`tokens:tiktok:${sessionId}`);
}

export async function setTikTokTokens(sessionId: string, t: OAuthTokens): Promise<boolean> {
  return writeTokens(`tokens:tiktok:${sessionId}`, t);
}

export async function clearTikTokTokens(sessionId: string): Promise<void> {
  await kvDel(`tokens:tiktok:${sessionId}`);
}

export async function getValidTikTokToken(sessionId: string): Promise<string | null> {
  if (!await hasSession(sessionId)) return null;
  const { kvGet } = await import('./kv');
  if (!await kvGet<{ createdAt: number }>(`oauth:session:${sessionId}`)) return null;
  const t = await getTikTokTokens(sessionId);
  if (!t) return null;
  if (Date.now() < t.expiresAt) return t.accessToken;
  if (!t.refreshToken || !process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) return null;

  try {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: t.refreshToken,
        client_key:    process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.message || 'Refresh failed');
    const fresh: OAuthTokens = {
      ...t,
      accessToken:  d.access_token,
      refreshToken: d.refresh_token || t.refreshToken,
      expiresAt:    Date.now() + (d.expires_in - 60) * 1000,
    };
    if (!await setTikTokTokens(sessionId, fresh)) return null;
    return fresh.accessToken;
  } catch { return null; }
}
