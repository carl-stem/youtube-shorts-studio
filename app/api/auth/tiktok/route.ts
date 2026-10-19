import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const key = process.env.TIKTOK_CLIENT_KEY;
  if (!key) return NextResponse.json({ error: 'TIKTOK_CLIENT_KEY not configured' }, { status: 503 });

  const base = process.env.NEXTAUTH_URL ?? `https://${req.headers.get('host')}`;
  const params = new URLSearchParams({
    client_key:    key,
    response_type: 'code',
    scope:         'user.info.basic,video.upload,video.publish',
    redirect_uri:  `${base}/api/auth/tiktok/callback`,
    state:         'tiktok_connect',
  });

  return NextResponse.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params}`);
}
