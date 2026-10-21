import { NextRequest, NextResponse } from 'next/server';
import { clearGoogleTokens, clearTikTokTokens, getGoogleTokens, getTikTokTokens, setGoogleTokens, setTikTokTokens, tokenEncryptionReady } from '../../../../../lib/tokenManager';
import { kvDel, kvGetDel, kvGet, kvSetWithExpiry } from '../../../../../lib/kv';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const stateCookie = req.cookies.get('oauth_tiktok_state')?.value;
  const savedState = stateCookie?.split('.')[0];
  const base = process.env.NEXTAUTH_URL;
  if (!base || new URL(base).origin !== base.replace(/\/$/, '')) return NextResponse.json({ error: 'Application origin is not configured' }, { status: 503 });
  const reject = (reason: string) => {
    const response = NextResponse.redirect(`${base}/?auth_error=${encodeURIComponent(reason)}`);
    response.cookies.delete('oauth_tiktok_state');
    return response;
  };

  if (!code) return reject('no_code_tiktok');
  if (!state || !savedState || state !== savedState) return reject('invalid_oauth_state');
  const stateKey = `oauth:state:tiktok:${state}`;
  const stateRecord = await kvGetDel<{ createdAt: number }>(stateKey);
  if (!stateRecord || !Number.isFinite(stateRecord.createdAt) || Date.now() - stateRecord.createdAt > 10 * 60 * 1000 || stateRecord.createdAt > Date.now() + 60_000) return reject('invalid_oauth_state');
  if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) return reject('tiktok_oauth_not_configured');

  if (!tokenEncryptionReady()) return reject('token_encryption_not_configured');
  try {
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_key:    process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        redirect_uri:  `${base}/api/auth/tiktok/callback`,
        grant_type:    'authorization_code',
      }),
    });
    const d = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(d.message || 'TikTok token exchange failed');

    let channelName = 'TikTok';
    try {
      const uRes = await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=display_name,username',
        { headers: { Authorization: `Bearer ${d.access_token}` } }
      );
      const u = await uRes.json();
      channelName = u.data?.user?.display_name || u.data?.user?.username || 'TikTok';
    } catch (_) {}

    const previousSessionId = req.cookies.get('oauth_session')?.value;
    const previousSession = previousSessionId ? await kvGet<{ createdAt: number }>(`oauth:session:${previousSessionId}`) : null;
    const previousTikTokTokens = previousSession && previousSessionId ? await getTikTokTokens(previousSessionId) : null;
    // Rotate the bearer session after OAuth; carry forward the other connected provider.
    const sessionId = (await import('node:crypto')).randomUUID();
    const saved = await setTikTokTokens(sessionId, {
      accessToken:  d.access_token,
      refreshToken: d.refresh_token,
      expiresAt:    Date.now() + (d.expires_in - 60) * 1000,
      scope:        d.scope,
      channelName,
    });
    const previousGoogleTokens = previousSession && previousSessionId ? await getGoogleTokens(previousSessionId) : null;
    const otherProviderSaved = (!previousGoogleTokens || await setGoogleTokens(sessionId, previousGoogleTokens))
      && (!previousTikTokTokens || await setTikTokTokens(sessionId, previousTikTokTokens));
    const sessionSaved = saved && otherProviderSaved && await kvSetWithExpiry(`oauth:session:${sessionId}`, { createdAt: Date.now() }, 60 * 60 * 24 * 30);
    if (!sessionSaved) return reject('token_storage_unavailable');
    if (previousSessionId && previousSession) {
      await clearGoogleTokens(previousSessionId);
      await clearTikTokTokens(previousSessionId);
      await kvDel(`oauth:session:${previousSessionId}`);
    }

    const response = NextResponse.redirect(`${base}/?connected=tiktok`);
    response.cookies.set('oauth_session', sessionId, { httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
    response.cookies.delete('oauth_tiktok_state');
    return response;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Auth error';
    return reject(msg);
  }
}
