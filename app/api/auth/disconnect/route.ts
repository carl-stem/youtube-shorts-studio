import { NextRequest, NextResponse } from 'next/server';
import { clearGoogleTokens, clearTikTokTokens } from '../../../../lib/tokenManager';
import { kvDel, kvGet } from '../../../../lib/kv';

export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get('oauth_session')?.value;
  if (!sessionId || !await kvGet<{ createdAt: number }>(`oauth:session:${sessionId}`)) return NextResponse.json({ error: 'Not connected' }, { status: 401 });
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  let platform: unknown;
  try { platform = (await req.json()).platform; } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (platform === 'google') await clearGoogleTokens(sessionId);
  else if (platform === 'tiktok') await clearTikTokTokens(sessionId);
  else return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  const response = NextResponse.json({ ok: true });
  const [google, tiktok] = await Promise.all([clearIfEmpty(sessionId, platform, 'google'), clearIfEmpty(sessionId, platform, 'tiktok')]);
  if (google && tiktok) {
    await kvDel(`oauth:session:${sessionId}`);
    response.cookies.delete('oauth_session');
  }
  return response;
}

async function clearIfEmpty(sessionId: string, platform: unknown, checked: 'google' | 'tiktok'): Promise<boolean> {
  const { getGoogleTokens, getTikTokTokens } = await import('../../../../lib/tokenManager');
  if (platform === checked) return true;
  const remaining = checked === 'google' ? await getGoogleTokens(sessionId) : await getTikTokTokens(sessionId);
  if (!remaining) await kvDel(`tokens:${checked}:${sessionId}`);
  return !remaining;
}
