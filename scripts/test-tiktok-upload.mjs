import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  TIKTOK_DEFAULT_CHUNK_BYTES, TIKTOK_MAX_CHUNK_BYTES, TIKTOK_MAX_FINAL_CHUNK_BYTES, TIKTOK_MAX_VIDEO_BYTES, TIKTOK_MIN_CHUNK_BYTES,
  TIKTOK_RELAY_MAX_BYTES, classifyTikTokChunkResponse, isTikTokUploadUrl, isValidTikTokPublishId, planTikTokChunks, tiktokChunkRange,
} from '../lib/publish/tiktokChunks.ts';

const MB = 1024 * 1024;
const ranges = (plan) => Array.from({ length: plan.totalChunkCount }, (_, i) => tiktokChunkRange(plan, i));

test('files smaller than one chunk are sent whole', () => {
  assert.deepEqual(planTikTokChunks(4_194_304), { videoSize: 4_194_304, chunkSize: 4_194_304, totalChunkCount: 1 });
  assert.equal(tiktokChunkRange(planTikTokChunks(100), 0).contentRange, 'bytes 0-99/100');
});

test('the TikTok guide example: 50,000,123 bytes in 10,000,000-byte chunks is 5 chunks, last one 10,000,123', () => {
  const plan = planTikTokChunks(50_000_123, 10_000_000);
  assert.equal(plan.totalChunkCount, 5);
  const r = ranges(plan);
  assert.equal(r[1].contentRange, 'bytes 10000000-19999999/50000123');
  assert.equal(r[4].end - r[4].start, 10_000_123);
});

test('every planned chunk obeys TikTok size rules and the plan covers the file exactly', () => {
  for (const size of [1, 5 * MB, TIKTOK_DEFAULT_CHUNK_BYTES - 1, TIKTOK_DEFAULT_CHUNK_BYTES, 64 * MB + 1, 500 * MB + 7, TIKTOK_MAX_VIDEO_BYTES]) {
    const plan = planTikTokChunks(size);
    const r = ranges(plan);
    assert.equal(r[0].start, 0);
    assert.equal(r.at(-1).end, size);
    for (let i = 1; i < r.length; i += 1) assert.equal(r[i].start, r[i - 1].end);
    assert.ok(plan.totalChunkCount >= 1 && plan.totalChunkCount <= 1000);
    if (plan.totalChunkCount > 1) {
      for (const c of r.slice(0, -1)) assert.ok(c.end - c.start >= TIKTOK_MIN_CHUNK_BYTES && c.end - c.start <= TIKTOK_MAX_CHUNK_BYTES);
      assert.ok(r.at(-1).end - r.at(-1).start <= TIKTOK_MAX_FINAL_CHUNK_BYTES);
    }
  }
  assert.throws(() => planTikTokChunks(0));
  assert.throws(() => planTikTokChunks(TIKTOK_MAX_VIDEO_BYTES + 1));
  assert.throws(() => planTikTokChunks(10 * MB, 4 * MB));
});

test('chunks above the relay limit cannot go through Vercel, so only tiny files may use the relay', () => {
  assert.ok(TIKTOK_RELAY_MAX_BYTES < TIKTOK_MIN_CHUNK_BYTES);
  assert.ok(TIKTOK_RELAY_MAX_BYTES < 4.5 * 1000 * 1000);
});

test('TikTok chunk responses are classified', () => {
  assert.equal(classifyTikTokChunkResponse(206), 'next');
  assert.equal(classifyTikTokChunkResponse(201), 'done');
  assert.equal(classifyTikTokChunkResponse(403), 'expired');
  assert.equal(classifyTikTokChunkResponse(503), 'retry');
  assert.equal(classifyTikTokChunkResponse(416), 'fatal');
  assert.equal(classifyTikTokChunkResponse(400), 'fatal');
});

test('upload URLs must be https on tiktokapis.com', () => {
  assert.equal(isTikTokUploadUrl('https://open-upload.tiktokapis.com/upload/?upload_id=1&upload_token=x'), true);
  assert.equal(isTikTokUploadUrl('http://open-upload.tiktokapis.com/upload/'), false);
  assert.equal(isTikTokUploadUrl('https://tiktokapis.com.evil.example/'), false);
});

test('publish ids in TikTok\'s documented format are accepted', () => {
  // Docs show ids such as "v_inbox_file~v2.123456789"; the old pattern rejected "~" and ".".
  assert.equal(isValidTikTokPublishId('v_inbox_file~v2.123456789'), true);
  assert.equal(isValidTikTokPublishId('short'), false);
  assert.equal(isValidTikTokPublishId('../../etc'), false);
  assert.equal(isValidTikTokPublishId(null), false);
});

test('the status route accepts documented publish ids', async () => {
  const source = await readFile(new URL('../app/api/upload/tiktok/status/route.ts', import.meta.url), 'utf8');
  assert.match(source, /isValidTikTokPublishId\(/);
});
