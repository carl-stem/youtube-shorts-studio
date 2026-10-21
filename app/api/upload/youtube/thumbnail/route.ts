import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, rejectCrossOrigin } from '../../../../../lib/apiGuard';
import { getValidGoogleToken } from '../../../../../lib/tokenManager';
import { kvGet } from '../../../../../lib/kv';
import { isValidYouTubeVideoId } from '../../../../../lib/youtubeMetadata';
import { uploadOwnershipKey } from '../../../../../lib/publish/resumable';
import { MAX_THUMBNAIL_BYTES } from '../../../../../lib/publish/thumbnail';

// Sets a custom thumbnail (thumbnails.set) on a video this session uploaded. The
// browser has already resized/compressed the image to a JPEG ≤ 2 MB.

const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export async function POST(req: NextRequest) {
  const crossOrigin = rejectCrossOrigin(req);
  if (crossOrigin) return crossOrigin;
  const sessionId = req.cookies.get('oauth_session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'YouTube not connected', code: 'not_connected' }, { status: 401 });
  const videoId = req.nextUrl.searchParams.get('videoId');
  if (!isValidYouTubeVideoId(videoId)) return NextResponse.json({ error: 'Invalid or missing YouTube video', code: 'invalid_video_id' }, { status: 400 });
  if (Number(req.headers.get('content-length') ?? '0') > MAX_THUMBNAIL_BYTES) {
    return NextResponse.json({ error: 'Thumbnail must be 2 MB or smaller', code: 'thumbnail_too_large' }, { status: 413 });
  }

  const limited = await applyRateLimit(req, 'youtube-thumbnail', 10, 60 * 60);
  if ('response' in limited) return limited.response;

  const owned = await kvGet<{ videoId: string }>(uploadOwnershipKey(sessionId, videoId));
  if (!owned || owned.videoId !== videoId) return NextResponse.json({ error: 'Upload not found', code: 'upload_not_found' }, { status: 404 });
  const token = await getValidGoogleToken(sessionId);
  if (!token) return NextResponse.json({ error: 'YouTube not connected', code: 'not_connected' }, { status: 401 });

  let buffer: ArrayBuffer;
  try { buffer = await req.arrayBuffer(); } catch { return NextResponse.json({ error: 'Could not read the image', code: 'invalid_image' }, { status: 400 }); }
  const image = new Uint8Array(buffer);
  if (image.byteLength > MAX_THUMBNAIL_BYTES) return NextResponse.json({ error: 'Thumbnail must be 2 MB or smaller', code: 'thumbnail_too_large' }, { status: 413 });
  if (!isJpeg(image)) return NextResponse.json({ error: 'Thumbnail must be a JPEG image', code: 'invalid_image' }, { status: 415 });

  try {
    const response = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' }, body: buffer },
    );
    if (response.ok) return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
    const payload: unknown = await response.json().catch(() => null);
    console.error('[upload/youtube/thumbnail] provider error', response.status, payload);
    const detail = JSON.stringify(payload ?? '');
    if (response.status === 403 && !detail.includes('quotaExceeded')) {
      // YouTube refuses custom thumbnails until the channel is verified (youtube.com/verify).
      return NextResponse.json({ error: 'Custom thumbnails need a verified YouTube account. Verify your channel at youtube.com/verify, then set the thumbnail in YouTube Studio.', code: 'thumbnail_not_allowed' }, { status: 403 });
    }
    if (response.status === 429 || detail.includes('uploadRateLimitExceeded')) {
      return NextResponse.json({ error: 'YouTube is limiting thumbnail changes right now. Try again later in YouTube Studio.', code: 'rate_limited' }, { status: 429 });
    }
    if (response.status === 400) return NextResponse.json({ error: 'YouTube did not accept this image. Try another one.', code: 'invalid_image' }, { status: 400 });
    return NextResponse.json({ error: 'Could not set the thumbnail. Try again in YouTube Studio.', code: 'provider_error' }, { status: 502 });
  } catch {
    return NextResponse.json({ error: 'Could not contact YouTube to set the thumbnail', code: 'provider_error' }, { status: 502 });
  }
}
