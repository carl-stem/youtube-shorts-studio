import { kvGet, kvSet } from './kv';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;       // Unix ms
  scope?: string;
  channelName?: string;    // YouTube channel or TikTok username
  channelId?: string;
}

// ── Google ────────────────────────────────────────────────────────────────────

export async function getGoogleTokens(): Promise<OAuthTokens | null> {
  return kvGet<OAuthTokens>('tokens:google');
}

export async function setGoogleTokens(t: OAuthTokens): Promise<void> {
  await kvSet('tokens:google', t);
}

export async function clearGoogleTokens(): Promise<void> {
  const { kvDel } = await import('./kv');
  await kvDel('tokens:google');
}

export async function getValidGoogleToken(): Promise<string | null> {
  const t = await getGoogleTokens();
  if (!t) return null;
  if (Date.now() < t.expiresAt) return t.accessToken;
  if (!t.refreshToken) return null;

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
    await setGoogleTokens(fresh);
    return fresh.accessToken;
  } catch { return null; }
}

// ── TikTok ────────────────────────────────────────────────────────────────────

export async function getTikTokTokens(): Promise<OAuthTokens | null> {
  return kvGet<OAuthTokens>('tokens:tiktok');
}

export async function setTikTokTokens(t: OAuthTokens): Promise<void> {
  await kvSet('tokens:tiktok', t);
}

export async function clearTikTokTokens(): Promise<void> {
  const { kvDel } = await import('./kv');
  await kvDel('tokens:tiktok');
}

export async function getValidTikTokToken(): Promise<string | null> {
  const t = await getTikTokTokens();
  if (!t) return null;
  if (Date.now() < t.expiresAt) return t.accessToken;
  if (!t.refreshToken) return null;

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
    await setTikTokTokens(fresh);
    return fresh.accessToken;
  } catch { return null; }
}
