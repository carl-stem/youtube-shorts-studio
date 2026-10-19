import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 503 });

  const base = process.env.NEXTAUTH_URL ?? `https://${req.headers.get('host')}`;
  const params = new URLSearchParams({
    client_id:     id,
    redirect_uri:  `${base}/api/auth/google/callback`,
    response_type: 'code',
    scope:         [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ].join(' '),
    access_type:   'offline',
    prompt:        'consent',
    state:         'google_connect',
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
