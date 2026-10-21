import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isUploadableVideoMime, normalizeVideoMime } from '../lib/videoMime.ts';
import { validateYouTubeUpload } from '../lib/youtubeMetadata.ts';

const exportTypes = ['video/webm;codecs=vp9,opus', 'video/webm; codecs="vp8, opus"', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'VIDEO/MP4', 'video/quicktime'];

test('MediaRecorder MIME types with codec parameters normalize to their base type', () => {
  assert.equal(normalizeVideoMime('video/webm;codecs=vp9,opus'), 'video/webm');
  assert.equal(normalizeVideoMime(' VIDEO/MP4 ; codecs=avc1'), 'video/mp4');
  assert.equal(normalizeVideoMime(''), 'video/mp4');
  assert.equal(normalizeVideoMime(null), 'video/mp4');
  for (const type of exportTypes) assert.equal(isUploadableVideoMime(type), true, type);
  assert.equal(isUploadableVideoMime('video/x-msvideo'), false);
  assert.equal(isUploadableVideoMime('image/png'), false);
});

test('YouTube validation and the shared helper agree on content types', () => {
  const base = { title: 'T', description: '', tags: '', privacy: 'private', publishAt: null, categoryId: null, madeForKids: 'false' };
  for (const type of exportTypes) {
    const r = validateYouTubeUpload({ ...base, videoType: type });
    assert.equal(r.ok && r.contentType, normalizeVideoMime(type), type);
  }
});

test('TikTok upload does not compare the raw MIME type exactly (webm exports were rejected with 415)', async () => {
  const source = await readFile(new URL('../app/api/upload/tiktok/init/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\]\.includes\(contentType\)/);
  assert.match(source, /isUploadableVideoMime\(/);
});
