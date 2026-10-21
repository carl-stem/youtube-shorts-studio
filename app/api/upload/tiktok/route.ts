import { NextRequest, NextResponse } from 'next/server';
import { getTikTokTokens, getValidTikTokToken } from '../../../../lib/tokenManager';
import { kvSetWithExpiry } from '../../../../lib/kv';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  const sessionId = req.cookies.get('oauth_session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'TikTok not connected' }, { status: 401 });
  const token = await getValidTikTokToken(sessionId);
  if (!token) return NextResponse.json({ error: 'TikTok not connected' }, { status: 401 });

  try {
    const form      = await req.formData();
    const videoFile = form.get('video') as File | null;
    const caption   = ((form.get('caption') as string) || '').slice(0, 2200);

    if (!videoFile || videoFile.size === 0) return NextResponse.json({ error: 'A non-empty video file is required' }, { status: 400 });
    const contentType = videoFile.type || 'video/mp4';
    if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(contentType)) return NextResponse.json({ error: 'Use an MP4, WebM, or MOV video for TikTok upload.' }, { status: 415 });
    if (videoFile.size > 64 * 1024 * 1024) return NextResponse.json({ error: 'Videos over 64 MB require multi-part transfer, which this upload flow does not support yet.' }, { status: 413 });
    const tokenInfo = await getTikTokTokens(sessionId);
    const grantedScopes = new Set(tokenInfo?.scope?.split(/[ ,]+/) ?? []);
    const publishMode = grantedScopes.has('video.upload') ? 'inbox' : null;
    if (!publishMode) return NextResponse.json({ error: 'TikTok upload permission is not available for this account' }, { status: 403 });
    const initEndpoint = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
    const initBody = {
      source_info: { source: 'FILE_UPLOAD', video_size: videoFile.size, chunk_size: videoFile.size, total_chunk_count: 1 },
    };
    const initRes = await fetch(initEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(initBody),
    });

    const initData = await initRes.json();
    if (!initRes.ok || initData.error?.code !== 'ok') throw new Error(initData.error?.message || 'TikTok init failed');

    if (initData.data?.upload_url) {
      const initUploadUrl = new URL(initData.data.upload_url);
      if (initUploadUrl.protocol !== 'https:' || !initUploadUrl.hostname.endsWith('.tiktokapis.com')) throw new Error('TikTok returned an invalid upload URL');
    }
    const { publish_id, upload_url } = initData.data ?? {};
    if (!publish_id || !upload_url) throw new Error(initData.error?.message || 'TikTok did not return a valid upload request');

    const videoBytes = await videoFile.arrayBuffer();
    const parsedUploadUrl = new URL(upload_url);
    if (parsedUploadUrl.protocol !== 'https:' || !parsedUploadUrl.hostname.endsWith('.tiktokapis.com')) throw new Error('TikTok returned an invalid upload URL');
    const uploadRes  = await fetch(parsedUploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type':   contentType,
        'Content-Length': videoFile.size.toString(),
        'Content-Range':  `bytes 0-${videoFile.size - 1}/${videoFile.size}`,
      },
      body: videoBytes,
    });

    const acceptedStatuses = [201];
    if (!acceptedStatuses.includes(uploadRes.status)) throw new Error(`TikTok upload was not accepted (HTTP ${uploadRes.status})`);

    if (!await kvSetWithExpiry(`tiktok:publish:${sessionId}:${publish_id}`, { publishId: publish_id, mode: 'inbox' }, 60 * 60 * 24)) {
      return NextResponse.json({ error: 'Upload transferred but status tracking could not be initialized. Check TikTok before retrying.' }, { status: 503 });
    }
    return NextResponse.json({ publishId: publish_id, mode: 'inbox', status: 'awaiting-user', message: 'Upload transferred to TikTok. Open the TikTok app to review and finish publishing it.' }, { status: 202 });

  } catch (err: unknown) {
    console.error('[upload/tiktok] upload failed', err);
    return NextResponse.json({ error: 'TikTok upload failed. Check the TikTok app before retrying.', code: 'upload_failed' }, { status: 500 });
  }
}
