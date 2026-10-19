import { NextRequest, NextResponse } from 'next/server';
import { clearGoogleTokens, clearTikTokTokens, getGoogleTokens, getTikTokTokens, setGoogleTokens, setTikTokTokens } from '../../../../../lib/tokenManager';
import { kvDel, kvGetDel, kvGet, kvSetWithExpiry } from '../../../../../lib/kv';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const stateCookie = req.cookies.get('oauth_google_state')?.value;
  const savedState = stateCookie?.split('.')[0];
  const base = process.env.NEXTAUTH_URL;
  if (!base || new URL(base).origin !== base.replace(/\/$/, '')) return NextResponse.json({ error: 'Application origin is not configured' }, { status: 503 });
  const reject = (reason: string) => {
    const response = NextResponse.redirect(`${base}/?auth_error=${encodeURIComponent(reason)}`);
    response.cookies.delete('oauth_google_state');
    return response;
  };

  if (!code) return reject('no_code');
  if (!state || !savedState || state !== savedState) return reject('invalid_oauth_state');
  const stateKey = `oauth:state:google:${state}`;
  const stateRecord = await kvGetDel<{ createdAt: number }>(stateKey);
  if (!stateRecord || !Number.isFinite(stateRecord.createdAt) || Date.now() - stateRecord.createdAt > 10 * 60 * 1000 || stateRecord.createdAt > Date.now() + 60_000) return reject('invalid_oauth_state');
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return reject('google_oauth_not_configured');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:  `${base}/api/auth/google/callback`,
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Token exchange failed');

    let channelName = 'YouTube';
    let channelId   = '';
    try {
      const chRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );
      const ch = await chRes.json();
      channelName = ch.items?.[0]?.snippet?.title ?? 'YouTube';
      channelId   = ch.items?.[0]?.id ?? '';
    } catch (_) {}

    const previousSessionId = req.cookies.get('oauth_session')?.value;
    const previousSession = previousSessionId ? await kvGet<{ createdAt: number }>(`oauth:session:${previousSessionId}`) : null;
    const previousGoogleTokens = previousSession && previousSessionId ? await getGoogleTokens(previousSessionId) : null;
    const previousTikTokTokens = previousSession && previousSessionId ? await getTikTokTokens(previousSessionId) : null;
    // Rotate the bearer session after OAuth; carry forward existing provider connections.
    const sessionId = (await import('node:crypto')).randomUUID();
    const saved = await setGoogleTokens(sessionId, {
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt:    Date.now() + (tokenData.expires_in - 60) * 1000,
      scope:        tokenData.scope,
      channelName,
      channelId,
    });
    const otherProviderSaved = (!previousGoogleTokens || await setGoogleTokens(sessionId, previousGoogleTokens))
      && (!previousTikTokTokens || await setTikTokTokens(sessionId, previousTikTokTokens));
    const sessionSaved = saved && otherProviderSaved && await kvSetWithExpiry(`oauth:session:${sessionId}`, { createdAt: Date.now() }, 60 * 60 * 24 * 30);
    if (!sessionSaved) return reject('token_storage_unavailable');
    if (previousSessionId && previousSession) {
      await clearGoogleTokens(previousSessionId);
      await clearTikTokTokens(previousSessionId);
      await kvDel(`oauth:session:${previousSessionId}`);
    }

    const response = NextResponse.redirect(`${base}/?connected=google`);
    response.cookies.set('oauth_session', sessionId, { httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
    response.cookies.delete('oauth_google_state');
    return response;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Auth error';
    return reject(msg);
  }
}
