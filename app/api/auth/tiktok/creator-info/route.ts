import { NextRequest, NextResponse } from 'next/server';
import { getValidTikTokToken } from '../../../../../lib/tokenManager';

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get('oauth_session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'TikTok not connected' }, { status: 401 });
  const token = await getValidTikTokToken(sessionId);
  if (!token) return NextResponse.json({ error: 'TikTok not connected' }, { status: 401 });
  try {
    const response = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: '{}',
    });
    const payload = await response.json();
    if (!response.ok || payload.error?.code !== 'ok' || !payload.data) {
      return NextResponse.json({ error: payload.error?.message || 'Could not load TikTok creator settings' }, { status: 502 });
    }
    return NextResponse.json({
      username: payload.data.creator_username,
      nickname: payload.data.creator_nickname,
      privacyOptions: payload.data.privacy_level_options ?? [],
      maxVideoDurationSeconds: payload.data.max_video_post_duration_sec,
      commentDisabled: Boolean(payload.data.comment_disabled),
      duetDisabled: Boolean(payload.data.duet_disabled),
      stitchDisabled: Boolean(payload.data.stitch_disabled),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not contact TikTok. Try again.' }, { status: 502 });
  }
}
