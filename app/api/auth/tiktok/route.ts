import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { kvSetWithExpiry } from '../../../../lib/kv';
import { tokenEncryptionReady } from '../../../../lib/tokenManager';

const OAUTH_STATE_COOKIE = 'oauth_tiktok_state';

export async function GET(req: NextRequest) {
  const key = process.env.TIKTOK_CLIENT_KEY;
  if (!key) return NextResponse.json({ error: 'TIKTOK_CLIENT_KEY not configured' }, { status: 503 });

  if (!tokenEncryptionReady()) return NextResponse.json({ error: 'Token encryption is not configured', code: 'token_encryption_not_configured' }, { status: 503 });

  const base = process.env.NEXTAUTH_URL;
  if (!base || new URL(base).origin !== base.replace(/\/$/, '')) return NextResponse.json({ error: 'NEXTAUTH_URL must be configured as the canonical application origin' }, { status: 503 });
  const params = new URLSearchParams({
    client_key:    key,
    response_type: 'code',
    scope:         'user.info.basic,video.upload,video.publish',
    redirect_uri:  `${base}/api/auth/tiktok/callback`,
    state:         randomBytes(32).toString('hex'),
  });

  const state = params.get('state')!;
  if (!await kvSetWithExpiry(`oauth:state:tiktok:${state}`, { createdAt: Date.now() }, 600)) {
    return NextResponse.json({ error: 'OAuth state storage unavailable' }, { status: 503 });
  }
  const response = NextResponse.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params}`);
  const stateCookie = `${state}.${randomBytes(32).toString('hex')}`;
  response.cookies.set(OAUTH_STATE_COOKIE, stateCookie, {
    httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/api/auth/tiktok/callback', maxAge: 600,
  });
  return response;
}
