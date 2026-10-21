import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routeSource = () => readFile(new URL('../app/api/analytics/youtube/route.ts', import.meta.url), 'utf8');

test('a channel with no Shorts gets zero totals, not an empty object the dashboard cannot render', async () => {
  // Bug: the route answered { videos: [], totals: {} } and AnalyticsDashboard called
  // totals.views.toLocaleString() on undefined.
  const { analyticsTotals } = await import('../lib/youtubeAnalytics.ts');
  assert.deepEqual(analyticsTotals([]), { views: 0, likes: 0, comments: 0, count: 0 });
  assert.deepEqual(analyticsTotals([{ views: 3, likes: 2, comments: 1 }, { views: 1, likes: 0, comments: 0 }]), { views: 4, likes: 2, comments: 1, count: 2 });
  assert.doesNotMatch(await routeSource(), /totals:\s*\{\s*\}/);
});

test('analytics errors carry stable codes', async () => {
  const source = await routeSource();
  const errors = [...source.matchAll(/NextResponse\.json\(\{ error:[^}]*\}/g)].map((m) => m[0]);
  assert.ok(errors.length >= 3);
  for (const e of errors) assert.match(e, /code: '[a-z_]+'/, e);
});
