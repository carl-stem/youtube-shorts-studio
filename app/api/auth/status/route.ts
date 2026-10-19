import { NextResponse } from 'next/server';
import { getGoogleTokens, getTikTokTokens } from '../../../../lib/tokenManager';
import { isKVConfigured } from '../../../../lib/kv';

export async function GET() {
  if (!isKVConfigured()) {
    return NextResponse.json({ kvConfigured: false, google: null, tiktok: null });
  }
  const [google, tiktok] = await Promise.all([getGoogleTokens(), getTikTokTokens()]);
  return NextResponse.json({
    kvConfigured: true,
    google:  google  ? { channelName: google.channelName,  connected: true } : null,
    tiktok:  tiktok  ? { channelName: tiktok.channelName,  connected: true } : null,
  });
}
