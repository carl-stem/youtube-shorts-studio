import { NextRequest, NextResponse } from 'next/server';
import { getValidGoogleToken, getGoogleTokens } from '../../../../lib/tokenManager';
import { analyticsTotals } from '../../../../lib/youtubeAnalytics';

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get('oauth_session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'YouTube not connected', code: 'not_connected' }, { status: 401 });
  const token = await getValidGoogleToken(sessionId);
  if (!token) return NextResponse.json({ error: 'YouTube not connected', code: 'not_connected' }, { status: 401 });

  try {
    const tokens    = await getGoogleTokens(sessionId);
    const channelId = tokens?.channelId;
    if (!channelId) return NextResponse.json({ error: 'Channel ID not found. Reconnect YouTube.', code: 'channel_not_found' }, { status: 400 });

    const listRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&maxResults=25&order=date&videoDuration=short`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const listData = await listRes.json();
    const videoIds: string[] = (listData.items || []).map((v: { id: { videoId: string } }) => v.id.videoId).filter(Boolean);

    if (videoIds.length === 0) return NextResponse.json({ videos: [], totals: analyticsTotals([]) });

    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const statsData = await statsRes.json();

    const videos = (statsData.items || []).map((v: {
      id: string;
      snippet?: { title?: string; thumbnails?: { medium?: { url?: string } }; publishedAt?: string };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails?: { duration?: string };
    }) => ({
      id:          v.id,
      title:       v.snippet?.title,
      thumbnail:   v.snippet?.thumbnails?.medium?.url,
      publishedAt: v.snippet?.publishedAt,
      views:       parseInt(v.statistics?.viewCount   || '0', 10),
      likes:       parseInt(v.statistics?.likeCount   || '0', 10),
      comments:    parseInt(v.statistics?.commentCount || '0', 10),
      duration:    v.contentDetails?.duration,
      shortsUrl:   `https://www.youtube.com/shorts/${v.id}`,
    }));

    const totals = analyticsTotals(videos);

    return NextResponse.json({ videos, totals });
  } catch (err: unknown) {
    console.error('[analytics/youtube] failed', err);
    return NextResponse.json({ error: 'Could not load YouTube analytics. Try again later.', code: 'analytics_failed' }, { status: 500 });
  }
}
