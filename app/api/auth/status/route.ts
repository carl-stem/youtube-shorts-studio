import { NextRequest, NextResponse } from 'next/server';
import { getGoogleTokens, getTikTokTokens } from '../../../../lib/tokenManager';
import { isKVConfigured, kvDel, kvGet } from '../../../../lib/kv';

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get('oauth_session')?.value;
  if (!isKVConfigured()) {
    return NextResponse.json({ kvConfigured: false, authenticated: false, google: null, tiktok: null });
  }
  if (!sessionId) {
    return NextResponse.json({ kvConfigured: true, authenticated: false, google: null, tiktok: null });
  }
  const validSession = await kvGet<{ createdAt: number }>(`oauth:session:${sessionId}`);
  if (!validSession) {
    const response = NextResponse.json({ kvConfigured: true, authenticated: false, google: null, tiktok: null });
    response.cookies.delete('oauth_session');
    return response;
  }
  const [google, tiktok] = await Promise.all([getGoogleTokens(sessionId), getTikTokTokens(sessionId)]);
  const response = NextResponse.json({
    kvConfigured: true,
    authenticated: true,
    google:  google  ? { channelName: google.channelName,  connected: true } : null,
    tiktok:  tiktok  ? { channelName: tiktok.channelName,  connected: true } : null,
  });
  if (!google && !tiktok) {
    await kvDel(`oauth:session:${sessionId}`);
    response.cookies.delete('oauth_session');
  }
  return response;
}
