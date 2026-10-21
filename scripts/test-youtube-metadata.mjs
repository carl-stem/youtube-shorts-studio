import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_CATEGORY_ID, YOUTUBE_CATEGORY_IDS, isValidYouTubeVideoId, validateYouTubeUpload,
} from '../lib/youtubeMetadata.ts';

const now = Date.UTC(2026, 9, 21, 12, 0, 0);
const future = new Date(now + 3_600_000).toISOString();
const base = { videoType: 'video/mp4', title: 'T', description: '', tags: '', privacy: 'private', publishAt: null, categoryId: null, madeForKids: 'false' };
const fail = (overrides) => {
  const r = validateYouTubeUpload({ ...base, ...overrides }, now);
  assert.equal(r.ok, false, JSON.stringify(overrides));
  return r;
};
const pass = (overrides) => {
  const r = validateYouTubeUpload({ ...base, ...overrides }, now);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.metadata;
};

test('publishAt is rejected unless privacy is private (YouTube only schedules private videos)', () => {
  assert.equal(fail({ privacy: 'public', publishAt: future }).code, 'publish_at_requires_private');
  assert.equal(fail({ privacy: 'unlisted', publishAt: future }).code, 'publish_at_requires_private');
  assert.equal(pass({ privacy: 'private', publishAt: future }).status.publishAt, future);
});

test('upload session route does not schedule non-private videos', async () => {
  // Pins the original bug: the route must delegate to the validator, not hand-roll publishAt checks.
  const source = await readFile(new URL('../app/api/upload/youtube/session/route.ts', import.meta.url), 'utf8');
  assert.match(source, /validateYouTubeUpload\(/);
});

test('publishAt must be a future ISO 8601 timestamp', () => {
  assert.equal(fail({ publishAt: new Date(now - 1000).toISOString() }).code, 'invalid_publish_at');
  assert.equal(fail({ publishAt: 'tomorrow' }).code, 'invalid_publish_at');
  assert.equal(fail({ publishAt: '10/22/2026' }).code, 'invalid_publish_at');
  assert.equal(pass({ publishAt: '2026-10-22T09:30:00+02:00' }).status.publishAt, '2026-10-22T07:30:00.000Z');
  assert.equal('publishAt' in pass({ publishAt: '' }).status, false);
});

test('only MP4, WebM and QuickTime uploads are accepted, ignoring codec parameters', () => {
  assert.equal(fail({ videoType: 'image/png' }).code, 'unsupported_media_type');
  assert.equal(fail({ videoType: 'video/x-msvideo' }).code, 'unsupported_media_type');
  for (const t of ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/quicktime', 'VIDEO/WEBM']) {
    assert.equal(validateYouTubeUpload({ ...base, videoType: t }, now).ok, true, t);
  }
  const r = validateYouTubeUpload({ ...base, videoType: 'video/webm;codecs=vp9,opus' }, now);
  assert.equal(r.contentType, 'video/webm');
  assert.equal(validateYouTubeUpload({ ...base, videoType: '' }, now).contentType, 'video/mp4');
});

test('categoryId defaults to 22 and must be a standard assignable category', () => {
  assert.equal(DEFAULT_CATEGORY_ID, '22');
  assert.equal(pass({}).snippet.categoryId, '22');
  assert.equal(pass({ categoryId: '10' }).snippet.categoryId, '10');
  assert.ok('27' in YOUTUBE_CATEGORY_IDS);
  assert.equal(fail({ categoryId: '999' }).code, 'invalid_category');
  assert.equal(fail({ categoryId: 'music' }).code, 'invalid_category');
});

test('selfDeclaredMadeForKids is required and must be a boolean (the audience question has no default)', () => {
  assert.equal(fail({ madeForKids: null }).code, 'made_for_kids_required');
  assert.equal(fail({ madeForKids: '' }).code, 'made_for_kids_required');
  assert.equal(pass({ madeForKids: 'true' }).status.selfDeclaredMadeForKids, true);
  assert.equal(pass({ madeForKids: 'false' }).status.selfDeclaredMadeForKids, false);
  assert.equal(fail({ madeForKids: 'yes' }).code, 'invalid_made_for_kids');
});

test('privacy must be public, unlisted or private; defaults to public', () => {
  assert.equal(fail({ privacy: 'friends' }).code, 'invalid_privacy');
  assert.equal(pass({ privacy: null }).status.privacyStatus, 'public');
});

test('title, description and tags are trimmed to YouTube limits', () => {
  const m = pass({ title: 'x'.repeat(150), description: 'd'.repeat(6000), tags: ' a, b ,, c ' });
  assert.equal(m.snippet.title.length, 100);
  assert.equal(m.snippet.description.length, 5000);
  assert.deepEqual(m.snippet.tags, ['a', 'b', 'c']);
  assert.equal(pass({ title: '' }).snippet.title, 'My Short');
});

test('video ids for status checks are validated', () => {
  assert.equal(isValidYouTubeVideoId('dQw4w9WgXcQ'), true);
  assert.equal(isValidYouTubeVideoId('../etc'), false);
  assert.equal(isValidYouTubeVideoId(null), false);
});
