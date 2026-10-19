import { NextRequest, NextResponse } from 'next/server';
import { setTikTokTokens } from '../../../../../lib/tokenManager';

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code');
  const base  = process.env.NEXTAUTH_URL ?? `https://${req.headers.get('host')}`;

  if (!code) return NextResponse.redirect(`${base}/?auth_error=no_code_tiktok`);

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

    await setTikTokTokens({
      accessToken:  d.access_token,
      refreshToken: d.refresh_token,
      expiresAt:    Date.now() + (d.expires_in - 60) * 1000,
      scope:        d.scope,
      channelName,
    });

    return NextResponse.redirect(`${base}/?connected=tiktok`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Auth error';
    return NextResponse.redirect(`${base}/?auth_error=${encodeURIComponent(msg)}`);
  }
}
