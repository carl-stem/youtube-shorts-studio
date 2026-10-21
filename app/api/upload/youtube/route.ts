import { NextRequest, NextResponse } from 'next/server';
import { getValidGoogleToken } from '../../../../lib/tokenManager';
import { kvSetWithExpiry } from '../../../../lib/kv';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  const sessionId = req.cookies.get('oauth_session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'YouTube not connected' }, { status: 401 });
  const token = await getValidGoogleToken(sessionId);
  if (!token) return NextResponse.json({ error: 'YouTube not connected' }, { status: 401 });

  try {
    const form      = await req.formData();
    const videoFile = form.get('video') as File | null;
    const title       = (form.get('title')       as string) || 'My Short';
    const description = (form.get('description') as string) || '';
    const tags        = ((form.get('tags') as string) || '').split(',').map(t => t.trim()).filter(Boolean);
    const privacy     = (form.get('privacy') as string) || 'public';
    const publishAt   = form.get('publishAt') as string | null;

    if (!videoFile || videoFile.size === 0) return NextResponse.json({ error: 'A non-empty video file is required' }, { status: 400 });
    if (videoFile.size > 256 * 1024 * 1024) return NextResponse.json({ error: 'Video exceeds the 256 MB upload limit' }, { status: 413 });
    if (!['public', 'unlisted', 'private'].includes(privacy)) return NextResponse.json({ error: 'Invalid privacy setting' }, { status: 400 });
    if (publishAt && (!Number.isFinite(Date.parse(publishAt)) || Date.parse(publishAt) <= Date.now())) return NextResponse.json({ error: 'Scheduled publish time must be in the future' }, { status: 400 });

    const metadata: Record<string, unknown> = {
      snippet: {
        title: title.slice(0, 100),
        description: description.slice(0, 5000),
        tags: tags.slice(0, 500),
        categoryId: '10',
        defaultLanguage: 'en',
      },
      status: {
        privacyStatus: privacy,
        selfDeclaredMadeForKids: false,
        ...(publishAt ? { publishAt } : {}),
      },
    };

    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': videoFile.type || 'video/mp4',
          'X-Upload-Content-Length': videoFile.size.toString(),
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initRes.ok) {
      const err = await initRes.json();
      throw new Error(err.error?.message || 'Failed to initiate YouTube upload');
    }

    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) throw new Error('No upload URL returned from YouTube');
    const parsedUploadUrl = new URL(uploadUrl);
    if (parsedUploadUrl.protocol !== 'https:' || parsedUploadUrl.hostname !== 'www.googleapis.com') throw new Error('YouTube returned an invalid upload URL');
    const videoBytes = await videoFile.arrayBuffer();
    const uploadRes  = await fetch(parsedUploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': videoFile.type || 'video/mp4',
        'Content-Length': videoFile.size.toString(),
      },
      body: videoBytes,
    });

    if (!uploadRes.ok && uploadRes.status !== 200 && uploadRes.status !== 201) {
      throw new Error(`Upload failed with status ${uploadRes.status}`);
    }

    const result  = await uploadRes.json();
    const videoId = result.id;
    if (!videoId) throw new Error('YouTube did not return a video ID');
    if (!await kvSetWithExpiry(`youtube:upload:${sessionId}:${videoId}`, { videoId }, 60 * 60 * 24)) {
      return NextResponse.json({ error: 'Upload was accepted but status tracking could not be initialized. Check YouTube Studio.' }, { status: 503 });
    }

    return NextResponse.json({
      status: 'processing',
      message: 'Upload was accepted. YouTube processing and publication are not confirmed yet.',
      videoId,
      videoUrl:      `https://www.youtube.com/watch?v=${videoId}`,
      shortsUrl:     `https://www.youtube.com/shorts/${videoId}`,
      title:         result.snippet?.title,
      privacyStatus: result.status?.privacyStatus,
    });

  } catch (err: unknown) {
    console.error('[upload/youtube] upload failed', err);
    return NextResponse.json({ error: 'YouTube upload failed. Check YouTube Studio before retrying.', code: 'upload_failed' }, { status: 500 });
  }
}
