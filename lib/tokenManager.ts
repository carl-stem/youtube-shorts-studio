import { kvDel, kvGet, kvSet } from './kv';
import { cookies } from 'next/headers';

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

// ── Google ────────────────────────────────────────────────────────────────────

export async function getGoogleTokens(sessionId: string): Promise<OAuthTokens | null> {
  return kvGet<OAuthTokens>(`tokens:google:${sessionId}`);
}

export async function setGoogleTokens(sessionId: string, t: OAuthTokens): Promise<boolean> {
  return kvSet(`tokens:google:${sessionId}`, t);
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
  return kvGet<OAuthTokens>(`tokens:tiktok:${sessionId}`);
}

export async function setTikTokTokens(sessionId: string, t: OAuthTokens): Promise<boolean> {
  return kvSet(`tokens:tiktok:${sessionId}`, t);
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
