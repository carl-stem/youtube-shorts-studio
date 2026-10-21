import { NextRequest, NextResponse } from 'next/server';
import { getValidGoogleToken } from '../../../../../lib/tokenManager';
import { kvGet } from '../../../../../lib/kv';

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get('oauth_session')?.value;
  const videoId = req.nextUrl.searchParams.get('videoId');
  if (!sessionId || !videoId || !/^[a-zA-Z0-9_-]{6,64}$/.test(videoId)) {
    return NextResponse.json({ error: 'Invalid or missing YouTube video' }, { status: 400 });
  }
  const owned = await kvGet<{ videoId: string }>(`youtube:upload:${sessionId}:${videoId}`);
  if (!owned || owned.videoId !== videoId) return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
  const token = await getValidGoogleToken(sessionId);
  if (!token) return NextResponse.json({ error: 'YouTube not connected' }, { status: 401 });
  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=processingDetails,status&id=${encodeURIComponent(videoId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) {
      console.error('[upload/youtube/status] provider error', response.status, payload.error);
      return NextResponse.json({ error: 'Could not check YouTube processing status', code: 'provider_error' }, { status: 502 });
    }
    const video = payload.items?.[0];
    if (!video) return NextResponse.json({ error: 'YouTube video not found' }, { status: 404 });
    const processingStatus = video.processingDetails?.processingStatus;
    const uploadStatus = video.status?.uploadStatus;
    const providerStatus = processingStatus ?? uploadStatus ?? 'processing';
    const processingSucceeded = processingStatus === 'succeeded' || processingStatus === 'processed';
    const processingFailed = processingStatus === 'failed' || processingStatus === 'terminated'
      || uploadStatus === 'failed' || uploadStatus === 'rejected' || uploadStatus === 'deleted';
    const status = processingFailed ? 'failed' : processingSucceeded ? 'processed' : 'processing';
    return NextResponse.json({
      status,
      providerStatus,
      failureReason: video.processingDetails?.processingFailureReason ?? video.status?.failureReason ?? video.status?.rejectionReason,
      progress: video.processingDetails?.processingProgress,
      privacyStatus: video.status?.privacyStatus,
      shortsUrl: `https://www.youtube.com/shorts/${videoId}`,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not contact YouTube to check processing status' }, { status: 502 });
  }
}
