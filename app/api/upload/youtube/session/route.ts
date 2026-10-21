import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, rejectCrossOrigin } from '../../../../../lib/apiGuard';
import { getValidGoogleToken } from '../../../../../lib/tokenManager';
import { kvSetWithExpiry } from '../../../../../lib/kv';
import { validateYouTubeUpload } from '../../../../../lib/youtubeMetadata';
import {
  DIRECT_CHUNK_BYTES, RESUMABLE_SESSION_TTL_SECONDS, isValidUploadSize, isYouTubeUploadUrl, resumableSessionKey,
  type StoredResumableSession,
} from '../../../../../lib/publish/resumable';

// Creates a YouTube resumable upload session from metadata only. The video bytes go
// browser→Google directly, or through the session-scoped chunk relay, so no request
// to this app ever carries the whole file (Vercel caps bodies at ~4.5 MB).

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export async function POST(req: NextRequest) {
  const crossOrigin = rejectCrossOrigin(req);
  if (crossOrigin) return crossOrigin;
  const sessionId = req.cookies.get('oauth_session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'YouTube not connected', code: 'not_connected' }, { status: 401 });

  const limited = await applyRateLimit(req, 'youtube-session', 20, 60 * 60);
  if ('response' in limited) return limited.response;

  const token = await getValidGoogleToken(sessionId);
  if (!token) return NextResponse.json({ error: 'YouTube not connected', code: 'not_connected' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 });
  }

  if (!isValidUploadSize(body.size)) {
    return NextResponse.json({ error: 'A non-empty video file is required', code: 'missing_video' }, { status: 400 });
  }
  const size = body.size;
  const madeForKids = typeof body.madeForKids === 'boolean' ? String(body.madeForKids) : str(body.madeForKids);
  const validation = validateYouTubeUpload({
    videoType:   str(body.contentType) ?? '',
    title:       str(body.title),
    description: str(body.description),
    tags:        str(body.tags),
    privacy:     str(body.privacy),
    publishAt:   str(body.publishAt),
    categoryId:  str(body.categoryId),
    madeForKids,
  });
  if (!validation.ok) return NextResponse.json({ error: validation.error, code: validation.code }, { status: validation.status });
  const { contentType, metadata } = validation;

  try {
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': contentType,
          'X-Upload-Content-Length': String(size),
          // Lets Google answer the browser's direct chunk PUTs with CORS headers for this origin.
          Origin: req.nextUrl.origin,
        },
        body: JSON.stringify(metadata),
      },
    );
    if (!initRes.ok) {
      const payload: unknown = await initRes.json().catch(() => null);
      console.error('[upload/youtube/session] init failed', initRes.status, payload);
      const quota = initRes.status === 403 && JSON.stringify(payload ?? '').includes('quotaExceeded');
      return NextResponse.json(
        quota
          ? { error: 'YouTube upload quota is used up for today. Try again tomorrow.', code: 'quota_exceeded' }
          : { error: 'YouTube did not accept the upload request. Try again in a moment.', code: 'provider_error' },
        { status: 502 },
      );
    }
    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl || !isYouTubeUploadUrl(uploadUrl)) {
      console.error('[upload/youtube/session] missing or unexpected upload URL');
      return NextResponse.json({ error: 'YouTube did not return a valid upload address', code: 'provider_error' }, { status: 502 });
    }

    const uploadId = randomBytes(16).toString('hex');
    const record: StoredResumableSession = { uploadUrl, size, contentType, createdAt: Date.now() };
    if (!await kvSetWithExpiry(resumableSessionKey(sessionId, uploadId), record, RESUMABLE_SESSION_TTL_SECONDS)) {
      return NextResponse.json({ error: 'Upload tracking is unavailable right now. Try again later.', code: 'kv_unavailable' }, { status: 503 });
    }
    return NextResponse.json(
      { uploadId, uploadUrl, chunkSize: DIRECT_CHUNK_BYTES, contentType },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err: unknown) {
    console.error('[upload/youtube/session] failed', err);
    return NextResponse.json({ error: 'Could not contact YouTube. Try again in a moment.', code: 'provider_error' }, { status: 502 });
  }
}
