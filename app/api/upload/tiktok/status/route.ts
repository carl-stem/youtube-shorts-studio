import { NextRequest, NextResponse } from 'next/server';
import { getValidTikTokToken } from '../../../../../lib/tokenManager';
import { kvGet } from '../../../../../lib/kv';
import { isValidTikTokPublishId, tiktokPublishKey } from '../../../../../lib/publish/tiktokChunks';

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get('oauth_session')?.value;
  const publishId = req.nextUrl.searchParams.get('publishId');
  if (!sessionId || !isValidTikTokPublishId(publishId)) {
    return NextResponse.json({ error: 'Invalid or missing publish request' }, { status: 400 });
  }
  const owned = await kvGet<{ publishId: string; mode: 'direct' | 'inbox' }>(tiktokPublishKey(sessionId, publishId));
  if (!owned || owned.publishId !== publishId) return NextResponse.json({ error: 'Publish request not found' }, { status: 404 });
  const token = await getValidTikTokToken(sessionId);
  if (!token) return NextResponse.json({ error: 'TikTok not connected' }, { status: 401 });
  try {
    const response = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error?.code !== 'ok' || !payload.data) {
      console.error('[upload/tiktok/status] provider error', response.status, payload.error);
      return NextResponse.json({ error: 'Could not check TikTok publishing status', code: 'provider_error' }, { status: 502 });
    }
    const providerStatus = String(payload.data.status ?? '');
    const status = providerStatus === 'PUBLISH_COMPLETE' ? 'published'
      : providerStatus === 'FAILED' ? 'failed'
      : providerStatus === 'SEND_TO_USER_INBOX' ? 'awaiting-user'
      : 'processing';
    return NextResponse.json({
      status,
      mode: owned.mode,
      providerStatus,
      failReason: status === 'failed' ? (payload.data.fail_reason ?? 'TikTok rejected the post') : undefined,
      uploadedBytes: payload.data.uploaded_bytes,
      publicPostIds: payload.data.publicaly_available_post_id,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not contact TikTok to check status' }, { status: 502 });
  }
}
