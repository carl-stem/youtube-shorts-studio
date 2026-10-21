import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, rejectCrossOrigin } from '../../../../../lib/apiGuard';
import { kvGet } from '../../../../../lib/kv';
import { parseContentRange } from '../../../../../lib/publish/resumable';
import {
  TIKTOK_RELAY_MAX_BYTES, classifyTikTokChunkResponse, isTikTokUploadUrl, isValidTikTokPublishId, tiktokUploadKey,
  type StoredTikTokUpload,
} from '../../../../../lib/publish/tiktokChunks';

// Fallback when the browser cannot PUT to TikTok directly (CORS). TikTok chunks
// are at least 5 MB, so this only carries a whole video of ≤ 4 MiB in one request,
// and only to the upload_url stored for this session's publish id.

export const maxDuration = 60;

export async function PUT(req: NextRequest) {
  const crossOrigin = rejectCrossOrigin(req);
  if (crossOrigin) return crossOrigin;
  const sessionId = req.cookies.get('oauth_session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'TikTok not connected', code: 'not_connected' }, { status: 401 });
  const publishId = req.nextUrl.searchParams.get('publishId');
  if (!isValidTikTokPublishId(publishId)) return NextResponse.json({ error: 'Invalid upload', code: 'invalid_publish_id' }, { status: 400 });
  if (Number(req.headers.get('content-length') ?? '0') > TIKTOK_RELAY_MAX_BYTES) {
    return NextResponse.json({ error: 'Too large to send through Shorts Studio', code: 'chunk_too_large' }, { status: 413 });
  }

  const limited = await applyRateLimit(req, 'tiktok-chunk', 20, 60 * 60);
  if ('response' in limited) return limited.response;

  const upload = await kvGet<StoredTikTokUpload>(tiktokUploadKey(sessionId, publishId));
  if (!upload || !isTikTokUploadUrl(upload.uploadUrl)) {
    return NextResponse.json({ error: 'This upload expired. Start it again.', code: 'upload_session_expired' }, { status: 410 });
  }
  const range = parseContentRange(req.headers.get('content-range'));
  let body: ArrayBuffer;
  try { body = await req.arrayBuffer(); } catch { return NextResponse.json({ error: 'Could not read upload', code: 'invalid_request' }, { status: 400 }); }
  if (!range || range.kind !== 'chunk' || range.start !== 0 || range.total !== upload.videoSize
    || range.end !== upload.videoSize - 1 || body.byteLength !== upload.videoSize || upload.videoSize > TIKTOK_RELAY_MAX_BYTES) {
    return NextResponse.json({ error: 'Only a whole video of 4 MB or less can be sent this way', code: 'relay_not_allowed' }, { status: 400 });
  }

  try {
    const upstream = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': upload.contentType, 'Content-Range': `bytes 0-${upload.videoSize - 1}/${upload.videoSize}` },
      body,
    });
    const outcome = classifyTikTokChunkResponse(upstream.status);
    if (outcome === 'done') return NextResponse.json({ state: 'complete' }, { headers: { 'Cache-Control': 'private, no-store' } });
    console.error('[upload/tiktok/chunk] provider status', upstream.status);
    if (outcome === 'expired') return NextResponse.json({ error: 'TikTok closed this upload. Start it again.', code: 'upload_session_expired' }, { status: 410 });
    if (outcome === 'retry') return NextResponse.json({ error: 'TikTok is busy. Retrying…', code: 'provider_error', retryable: true }, { status: 502 });
    return NextResponse.json({ error: 'TikTok rejected the upload.', code: 'upload_rejected' }, { status: 502 });
  } catch (err: unknown) {
    console.error('[upload/tiktok/chunk] could not reach TikTok', err);
    return NextResponse.json({ error: 'Could not reach TikTok. Retrying…', code: 'provider_unreachable', retryable: true }, { status: 502 });
  }
}
