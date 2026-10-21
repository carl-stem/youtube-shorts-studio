import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, rejectCrossOrigin } from '../../../../../lib/apiGuard';
import { getTikTokTokens, getValidTikTokToken } from '../../../../../lib/tokenManager';
import { kvSetWithExpiry } from '../../../../../lib/kv';
import { isUploadableVideoMime, normalizeVideoMime } from '../../../../../lib/videoMime';
import {
  TIKTOK_UPLOAD_URL_TTL_SECONDS, isTikTokUploadUrl, isValidTikTokPublishId, isValidTikTokVideoSize, planTikTokChunks,
  tiktokPublishKey, tiktokUploadKey, type StoredTikTokUpload,
} from '../../../../../lib/publish/tiktokChunks';

// Starts a TikTok inbox FILE_UPLOAD from metadata only. The browser then PUTs the
// chunks straight to TikTok's upload_url; chunks are at least 5 MB, above what a
// Vercel function body can carry, so only whole files ≤ 4 MiB can use the relay.

export async function POST(req: NextRequest) {
  const crossOrigin = rejectCrossOrigin(req);
  if (crossOrigin) return crossOrigin;
  const sessionId = req.cookies.get('oauth_session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'TikTok not connected', code: 'not_connected' }, { status: 401 });

  const limited = await applyRateLimit(req, 'tiktok-init', 10, 60 * 60);
  if ('response' in limited) return limited.response;

  const token = await getValidTikTokToken(sessionId);
  if (!token) return NextResponse.json({ error: 'TikTok not connected', code: 'not_connected' }, { status: 401 });

  let size: unknown;
  let rawType: unknown;
  try { ({ size, contentType: rawType } = await req.json() as { size?: unknown; contentType?: unknown }); }
  catch { return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 }); }
  const declaredType = typeof rawType === 'string' ? rawType : '';
  if (!isUploadableVideoMime(declaredType)) {
    return NextResponse.json({ error: 'Use an MP4, WebM, or MOV video for TikTok upload.', code: 'unsupported_media_type' }, { status: 415 });
  }
  if (!isValidTikTokVideoSize(size)) {
    return NextResponse.json({ error: 'TikTok accepts videos up to 4 GB.', code: 'video_too_large' }, { status: 413 });
  }

  const tokenInfo = await getTikTokTokens(sessionId);
  const grantedScopes = new Set(tokenInfo?.scope?.split(/[ ,]+/) ?? []);
  if (!grantedScopes.has('video.upload')) {
    return NextResponse.json({ error: 'TikTok upload permission is not available for this account', code: 'scope_missing' }, { status: 403 });
  }

  const plan = planTikTokChunks(size);
  try {
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        source_info: { source: 'FILE_UPLOAD', video_size: plan.videoSize, chunk_size: plan.chunkSize, total_chunk_count: plan.totalChunkCount },
      }),
    });
    const initData = await initRes.json().catch(() => null) as { data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } } | null;
    if (!initRes.ok || initData?.error?.code !== 'ok') {
      console.error('[upload/tiktok/init] provider error', initRes.status, initData?.error);
      const busy = initRes.status === 429 || initData?.error?.code === 'rate_limit_exceeded' || initData?.error?.code === 'spam_risk_too_many_pending_share';
      return NextResponse.json(
        busy
          ? { error: 'TikTok is limiting uploads for this account right now. Finish pending drafts in TikTok or try again later.', code: 'provider_rate_limited' }
          : { error: 'TikTok did not accept the upload request. Try again in a moment.', code: 'provider_error' },
        { status: busy ? 429 : 502 },
      );
    }
    const publishId = initData.data?.publish_id ?? null;
    const uploadUrl = initData.data?.upload_url ?? '';
    if (!isValidTikTokPublishId(publishId) || !isTikTokUploadUrl(uploadUrl)) {
      console.error('[upload/tiktok/init] unexpected init response');
      return NextResponse.json({ error: 'TikTok did not return a valid upload address', code: 'provider_error' }, { status: 502 });
    }

    const contentType = normalizeVideoMime(declaredType);
    const upload: StoredTikTokUpload = { uploadUrl, videoSize: plan.videoSize, contentType };
    const tracked = await kvSetWithExpiry(tiktokPublishKey(sessionId, publishId), { publishId, mode: 'inbox' }, 60 * 60 * 24)
      && await kvSetWithExpiry(tiktokUploadKey(sessionId, publishId), upload, TIKTOK_UPLOAD_URL_TTL_SECONDS);
    if (!tracked) return NextResponse.json({ error: 'Upload tracking is unavailable right now. Try again later.', code: 'kv_unavailable' }, { status: 503 });

    return NextResponse.json(
      { publishId, uploadUrl, contentType, chunkSize: plan.chunkSize, totalChunkCount: plan.totalChunkCount },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err: unknown) {
    console.error('[upload/tiktok/init] failed', err);
    return NextResponse.json({ error: 'Could not contact TikTok. Try again in a moment.', code: 'provider_error' }, { status: 502 });
  }
}
