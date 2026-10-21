import { NextRequest, NextResponse } from 'next/server';
import { getValidGoogleToken } from '../../../../lib/tokenManager';
import { kvSetWithExpiry } from '../../../../lib/kv';
import { validateYouTubeUpload } from '../../../../lib/youtubeMetadata';

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
    const field = (name: string) => { const v = form.get(name); return typeof v === 'string' ? v : null; };

    if (!videoFile || videoFile.size === 0) return NextResponse.json({ error: 'A non-empty video file is required', code: 'missing_video' }, { status: 400 });
    if (videoFile.size > 256 * 1024 * 1024) return NextResponse.json({ error: 'Video exceeds the 256 MB upload limit', code: 'video_too_large' }, { status: 413 });
    const validation = validateYouTubeUpload({
      videoType:   videoFile.type,
      title:       field('title'),
      description: field('description'),
      tags:        field('tags'),
      privacy:     field('privacy'),
      publishAt:   field('publishAt'),
      categoryId:  field('categoryId'),
      madeForKids: field('selfDeclaredMadeForKids'),
    });
    if (!validation.ok) return NextResponse.json({ error: validation.error, code: validation.code }, { status: validation.status });
    const { contentType, metadata } = validation;

    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': contentType,
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
        'Content-Type': contentType,
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
