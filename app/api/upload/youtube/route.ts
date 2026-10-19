import { NextRequest, NextResponse } from 'next/server';
import { getValidGoogleToken } from '../../../../lib/tokenManager';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const token = await getValidGoogleToken();
  if (!token) return NextResponse.json({ error: 'YouTube not connected' }, { status: 401 });

  try {
    const form      = await req.formData();
    const videoFile = form.get('video') as File | null;
    const title       = (form.get('title')       as string) || 'My Short';
    const description = (form.get('description') as string) || '';
    const tags        = ((form.get('tags') as string) || '').split(',').map(t => t.trim()).filter(Boolean);
    const privacy     = (form.get('privacy') as string) || 'public';
    const publishAt   = form.get('publishAt') as string | null;

    if (!videoFile) return NextResponse.json({ error: 'No video file provided' }, { status: 400 });

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

    const videoBytes = await videoFile.arrayBuffer();
    const uploadRes  = await fetch(uploadUrl, {
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

    return NextResponse.json({
      videoId,
      videoUrl:      `https://www.youtube.com/watch?v=${videoId}`,
      shortsUrl:     `https://www.youtube.com/shorts/${videoId}`,
      title:         result.snippet?.title,
      privacyStatus: result.status?.privacyStatus,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
