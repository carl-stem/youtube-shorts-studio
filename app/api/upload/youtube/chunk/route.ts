import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, rejectCrossOrigin } from '../../../../../lib/apiGuard';
import { kvGet, kvSetWithExpiry } from '../../../../../lib/kv';
import { isValidYouTubeVideoId } from '../../../../../lib/youtubeMetadata';
import {
  RELAY_CHUNK_BYTES, RESUMABLE_SESSION_TTL_SECONDS, UPLOAD_OWNERSHIP_TTL_SECONDS, classifyUploadResponse,
  isValidUploadId, isYouTubeUploadUrl, parseContentRange, resumableSessionKey, uploadOwnershipKey, validateRelayChunk,
  type StoredResumableSession,
} from '../../../../../lib/publish/resumable';

// Session-scoped relay for one resumable upload: forwards a ≤4 MiB chunk (or an
// empty `bytes */total` status query) to the Google upload URL stored for this
// oauth_session + uploadId. It never accepts a caller-supplied destination, so it is
// not an open proxy. Completion is observed here, which is where the videoId gets
// its ownership record for the status and thumbnail routes.

export const maxDuration = 60;

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function PUT(req: NextRequest) {
  const crossOrigin = rejectCrossOrigin(req);
  if (crossOrigin) return crossOrigin;
  const sessionId = req.cookies.get('oauth_session')?.value;
  if (!sessionId) return json({ error: 'YouTube not connected', code: 'not_connected' }, 401);

  const uploadId = req.nextUrl.searchParams.get('uploadId');
  if (!isValidUploadId(uploadId)) return json({ error: 'Invalid upload', code: 'invalid_upload_id' }, 400);
  const range = parseContentRange(req.headers.get('content-range'));
  if (!range) return json({ error: 'Invalid Content-Range', code: 'invalid_content_range' }, 400);
  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (declaredLength > RELAY_CHUNK_BYTES) return json({ error: 'Chunk too large', code: 'chunk_too_large' }, 413);

  const limited = await applyRateLimit(req, 'youtube-chunk', 240, 60);
  if ('response' in limited) return limited.response;

  const key = resumableSessionKey(sessionId, uploadId);
  const session = await kvGet<StoredResumableSession>(key);
  if (!session || !isYouTubeUploadUrl(session.uploadUrl)) {
    return json({ error: 'This upload was not found or has expired. Start the upload again.', code: 'upload_session_expired' }, 410);
  }

  let body: ArrayBuffer;
  try { body = await req.arrayBuffer(); } catch { return json({ error: 'Could not read chunk', code: 'invalid_request' }, 400); }
  const invalid = validateRelayChunk(range, body.byteLength, session.size, RELAY_CHUNK_BYTES);
  if (invalid) return json({ error: 'Chunk does not match this upload', code: invalid }, invalid === 'chunk_too_large' ? 413 : 400);

  let upstream: Response;
  try {
    upstream = await fetch(session.uploadUrl, {
      method: 'PUT',
      // Google's "308 Resume Incomplete" has no Location; never treat it as a redirect.
      redirect: 'manual',
      headers: range.kind === 'chunk'
        // fetch derives Content-Length from the body (0 for a body-less PUT).
        ? { 'Content-Type': session.contentType, 'Content-Range': `bytes ${range.start}-${range.end}/${range.total}` }
        : { 'Content-Range': `bytes */${range.total}` },
      body: range.kind === 'chunk' ? body : undefined,
    });
  } catch (err: unknown) {
    console.error('[upload/youtube/chunk] could not reach Google', err);
    return json({ error: 'Could not reach YouTube. Retrying…', code: 'provider_unreachable', retryable: true }, 502);
  }

  const step = classifyUploadResponse(upstream.status, upstream.headers.get('range'));
  if (step.kind === 'incomplete') return json({ state: 'incomplete', received: step.received });
  if (step.kind === 'expired') return json({ error: 'YouTube closed this upload session. Start the upload again.', code: 'upload_session_expired' }, 410);
  if (step.kind === 'retry') return json({ error: 'YouTube is busy. Retrying…', code: 'provider_error', retryable: true }, 502);
  if (step.kind === 'fatal') {
    console.error('[upload/youtube/chunk] upload rejected', upstream.status, await upstream.text().catch(() => ''));
    return json({ error: 'YouTube rejected the upload. Check YouTube Studio before retrying.', code: 'upload_rejected' }, 502);
  }

  const payload: unknown = await upstream.json().catch(() => null);
  const fromPayload = payload && typeof payload === 'object' && 'id' in payload && typeof payload.id === 'string' ? payload.id : null;
  const videoId = fromPayload ?? session.videoId ?? null;
  if (!isValidYouTubeVideoId(videoId)) {
    console.error('[upload/youtube/chunk] completed without a video id');
    return json({ error: 'YouTube finished the upload but did not return a video ID. Check YouTube Studio.', code: 'provider_error' }, 502);
  }
  const owned = await kvSetWithExpiry(uploadOwnershipKey(sessionId, videoId), { videoId }, UPLOAD_OWNERSHIP_TTL_SECONDS);
  const remainingTtl = Math.max(60, RESUMABLE_SESSION_TTL_SECONDS - Math.floor((Date.now() - session.createdAt) / 1000));
  if (!session.videoId) await kvSetWithExpiry(key, { ...session, videoId }, remainingTtl);
  return json({
    state: 'complete',
    videoId,
    tracked: owned,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    shortsUrl: `https://www.youtube.com/shorts/${videoId}`,
  });
}
