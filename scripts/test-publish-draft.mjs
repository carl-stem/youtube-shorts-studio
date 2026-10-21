import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin'; // fixed zone with DST so offsets are deterministic

const {
  DESCRIPTION_MAX, effectivePrivacy, initialYouTubeForm, isShortsCandidate, localDateTimeToIso,
  minScheduleValue, toYouTubeDraft, withShortsTag, youTubeFormProblem,
} = await import('../lib/publish/youtubeDraft.ts');
const { MAX_THUMBNAIL_BYTES, fitLongEdge } = await import('../lib/publish/thumbnail.ts');
const { DEFAULT_CATEGORY_ID, YOUTUBE_CATEGORY_IDS } = await import('../lib/youtubeMetadata.ts');

const vertical = { filename: 'my_clip.webm', durationSeconds: 45, width: 1080, height: 1920 };

test('vertical videos up to 3 minutes are Shorts candidates; others are not', () => {
  assert.equal(isShortsCandidate(vertical), true);
  assert.equal(isShortsCandidate({ ...vertical, durationSeconds: 180 }), true);
  assert.equal(isShortsCandidate({ ...vertical, durationSeconds: 181 }), false);
  assert.equal(isShortsCandidate({ ...vertical, width: 1920, height: 1080 }), false);
  assert.equal(isShortsCandidate({ filename: 'x.mp4', durationSeconds: 30 }), false);
});

test('defaults: category per mode, no kids answer, private, #Shorts only suggested for Shorts', () => {
  const audio = initialYouTubeForm(vertical, '10');
  assert.equal(audio.categoryId, '10');
  assert.equal(audio.title, 'my clip');
  assert.equal(audio.madeForKids, null);
  assert.equal(audio.privacy, 'private');
  assert.equal(audio.addShortsTag, true);
  const video = initialYouTubeForm({ ...vertical, durationSeconds: 600 }, DEFAULT_CATEGORY_ID);
  assert.equal(video.categoryId, '22');
  assert.equal(video.addShortsTag, false);
  assert.ok(Object.hasOwn(YOUTUBE_CATEGORY_IDS, video.categoryId));
});

test('#Shorts is appended once and only when chosen', () => {
  assert.equal(withShortsTag('', true), '#Shorts');
  assert.equal(withShortsTag('Hello', true), 'Hello\n\n#Shorts');
  assert.equal(withShortsTag('Hello #shorts', true), 'Hello #shorts');
  assert.equal(withShortsTag('Hello', false), 'Hello');
});

test('schedule converts local wall time to ISO with the right DST offset', () => {
  assert.equal(localDateTimeToIso('2026-07-01T09:30'), '2026-07-01T09:30:00+02:00');
  assert.equal(localDateTimeToIso('2026-12-01T09:30'), '2026-12-01T09:30:00+01:00');
  assert.equal(localDateTimeToIso('2026-02-30T09:30'), null);
  assert.equal(localDateTimeToIso('2026-03-29T02:30'), null, 'skipped DST hour');
  assert.equal(localDateTimeToIso('tomorrow'), null);
  assert.equal(Date.parse(localDateTimeToIso('2026-07-01T09:30')), Date.UTC(2026, 6, 1, 7, 30));
});

test('choosing a schedule forces private', () => {
  assert.equal(effectivePrivacy({ privacy: 'public', scheduleAt: '' }), 'public');
  assert.equal(effectivePrivacy({ privacy: 'public', scheduleAt: '2026-12-01T09:30' }), 'private');
  const now = Date.UTC(2026, 10, 1, 8, 0);
  const draft = toYouTubeDraft({ ...initialYouTubeForm(vertical, '22'), madeForKids: 'no', privacy: 'public', scheduleAt: '2026-12-01T09:30' });
  assert.equal(draft.privacy, 'private');
  assert.equal(draft.publishAt, '2026-12-01T09:30:00+01:00');
  assert.equal(draft.madeForKids, false);
  assert.match(minScheduleValue(now), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('publish stays blocked until the kids question is answered and the schedule is valid', () => {
  const now = Date.UTC(2026, 10, 1, 8, 0);
  const form = initialYouTubeForm(vertical, '22');
  assert.match(youTubeFormProblem(form, now), /made for kids/);
  assert.equal(youTubeFormProblem({ ...form, madeForKids: 'yes' }, now), null);
  assert.match(youTubeFormProblem({ ...form, madeForKids: 'no', scheduleAt: '2026-11-01T09:05' }, now), /at least 15 minutes/);
  assert.equal(youTubeFormProblem({ ...form, madeForKids: 'no', scheduleAt: '2026-11-01T09:30' }, now), null);
  assert.match(youTubeFormProblem({ ...form, madeForKids: 'no', description: 'x'.repeat(DESCRIPTION_MAX + 1) }, now), /Shorten/);
  assert.match(youTubeFormProblem({ ...form, madeForKids: 'no', title: '  ' }, now), /title/);
  assert.equal(toYouTubeDraft({ ...form, madeForKids: 'yes' }).madeForKids, true);
});

test('thumbnails scale down to a 1280 px long edge and never up', () => {
  assert.deepEqual(fitLongEdge(1920, 1080), { width: 1280, height: 720 });
  assert.deepEqual(fitLongEdge(1080, 1920), { width: 720, height: 1280 });
  assert.deepEqual(fitLongEdge(640, 360), { width: 640, height: 360 });
  assert.throws(() => fitLongEdge(0, 10));
  assert.equal(MAX_THUMBNAIL_BYTES, 2 * 1024 * 1024);
});
