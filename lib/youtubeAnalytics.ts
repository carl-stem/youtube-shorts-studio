// Pure aggregation for /api/analytics/youtube, shared with tests.

export interface AnalyticsTotals {
  views: number;
  likes: number;
  comments: number;
  count: number;
}

export function analyticsTotals(videos: ReadonlyArray<{ views: number; likes: number; comments: number }>): AnalyticsTotals {
  return {
    views:    videos.reduce((s, v) => s + v.views, 0),
    likes:    videos.reduce((s, v) => s + v.likes, 0),
    comments: videos.reduce((s, v) => s + v.comments, 0),
    count:    videos.length,
  };
}
