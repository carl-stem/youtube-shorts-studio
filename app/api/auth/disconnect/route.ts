import { NextRequest, NextResponse } from 'next/server';
import { clearGoogleTokens, clearTikTokTokens } from '../../../../lib/tokenManager';

export async function POST(req: NextRequest) {
  const { platform } = await req.json();
  if (platform === 'google') await clearGoogleTokens();
  else if (platform === 'tiktok') await clearTikTokTokens();
  return NextResponse.json({ ok: true });
}
