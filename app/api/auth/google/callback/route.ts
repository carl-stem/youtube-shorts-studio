import { NextRequest, NextResponse } from 'next/server';
import { setGoogleTokens } from '../../../../../lib/tokenManager';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const base = process.env.NEXTAUTH_URL ?? `https://${req.headers.get('host')}`;

  if (!code) {
    return NextResponse.redirect(`${base}/?auth_error=no_code`);
  }

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

    await setGoogleTokens({
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt:    Date.now() + (tokenData.expires_in - 60) * 1000,
      scope:        tokenData.scope,
      channelName,
      channelId,
    });

    return NextResponse.redirect(`${base}/?connected=google`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Auth error';
    return NextResponse.redirect(`${base}/?auth_error=${encodeURIComponent(msg)}`);
  }
}
