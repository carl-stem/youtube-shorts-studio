import { NextRequest, NextResponse } from 'next/server';
import { getValidTikTokToken } from '../../../../lib/tokenManager';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const token = await getValidTikTokToken();
  if (!token) return NextResponse.json({ error: 'TikTok not connected' }, { status: 401 });

  try {
    const form      = await req.formData();
    const videoFile = form.get('video') as File | null;
    const caption   = ((form.get('caption') as string) || '').slice(0, 2200);
    const privacy   = (form.get('privacy') as string) || 'PUBLIC_TO_EVERYONE';

    if (!videoFile) return NextResponse.json({ error: 'No video file provided' }, { status: 400 });

    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title:                    caption,
          privacy_level:            privacy,
          disable_duet:             false,
          disable_comment:          false,
          disable_stitch:           false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source:            'FILE_UPLOAD',
          video_size:        videoFile.size,
          chunk_size:        videoFile.size,
          total_chunk_count: 1,
        },
      }),
    });

    const initData = await initRes.json();
    if (!initRes.ok) throw new Error(initData.error?.message || 'TikTok init failed');

    const { publish_id, upload_url } = initData.data;

    const videoBytes = await videoFile.arrayBuffer();
    const uploadRes  = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type':   videoFile.type || 'video/mp4',
        'Content-Length': videoFile.size.toString(),
        'Content-Range':  `bytes 0-${videoFile.size - 1}/${videoFile.size}`,
      },
      body: videoBytes,
    });

    if (!uploadRes.ok) throw new Error(`TikTok upload PUT failed: ${uploadRes.status}`);

    return NextResponse.json({ publishId: publish_id, message: 'Upload submitted for processing' });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
