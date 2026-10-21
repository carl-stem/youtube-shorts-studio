import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { kvSetWithExpiry } from '../../../../lib/kv';
import { tokenEncryptionReady } from '../../../../lib/tokenManager';

const OAUTH_STATE_COOKIE = 'oauth_google_state';

export async function GET(req: NextRequest) {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 503 });

  if (!tokenEncryptionReady()) return NextResponse.json({ error: 'Token encryption is not configured', code: 'token_encryption_not_configured' }, { status: 503 });

  const base = process.env.NEXTAUTH_URL;
  if (!base || new URL(base).origin !== base.replace(/\/$/, '')) return NextResponse.json({ error: 'NEXTAUTH_URL must be configured as the canonical application origin' }, { status: 503 });
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
    state:         randomBytes(32).toString('hex'),
  });

  const state = params.get('state')!;
  if (!await kvSetWithExpiry(`oauth:state:google:${state}`, { createdAt: Date.now() }, 600)) {
    return NextResponse.json({ error: 'OAuth state storage unavailable' }, { status: 503 });
  }
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  const stateCookie = `${state}.${randomBytes(32).toString('hex')}`;
  response.cookies.set(OAUTH_STATE_COOKIE, stateCookie, {
    httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/api/auth/google/callback', maxAge: 600,
  });
  return response;
}
