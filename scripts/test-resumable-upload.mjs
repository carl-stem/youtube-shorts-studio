import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHUNK_GRANULARITY, DIRECT_CHUNK_BYTES, RELAY_CHUNK_BYTES, RESUMABLE_SESSION_TTL_SECONDS,
  classifyUploadResponse, findResumeCandidate, isValidChunkSize, isValidUploadId, isValidUploadSize,
  isYouTubeUploadUrl, parseContentRange, parseResumeRecords, planChunk, receivedFromRangeHeader,
  retryDelayMs, statusQueryRange, validateRelayChunk,
} from '../lib/publish/resumable.ts';

test('chunk sizes are multiples of 256 KiB and relay chunks fit under the 4.5 MB body limit', () => {
  assert.equal(DIRECT_CHUNK_BYTES % CHUNK_GRANULARITY, 0);
  assert.equal(RELAY_CHUNK_BYTES % CHUNK_GRANULARITY, 0);
  assert.ok(RELAY_CHUNK_BYTES < 4.5 * 1000 * 1000);
  assert.equal(isValidChunkSize(CHUNK_GRANULARITY + 1), false);
  assert.equal(isValidChunkSize(0), false);
});

test('planChunk walks the file and ends with a short final chunk', () => {
  const total = RELAY_CHUNK_BYTES * 2 + 10;
  const plans = [];
  for (let offset = 0, p; (p = planChunk(offset, total, RELAY_CHUNK_BYTES)); offset = p.end) plans.push(p);
  assert.deepEqual(plans.map((p) => p.end - p.start), [RELAY_CHUNK_BYTES, RELAY_CHUNK_BYTES, 10]);
  assert.equal(plans[0].contentRange, `bytes 0-${RELAY_CHUNK_BYTES - 1}/${total}`);
  assert.equal(plans[2].contentRange, `bytes ${RELAY_CHUNK_BYTES * 2}-${total - 1}/${total}`);
  assert.equal(planChunk(total, total, RELAY_CHUNK_BYTES), null);
  assert.throws(() => planChunk(0, total, 1000));
  assert.throws(() => planChunk(total + 1, total, RELAY_CHUNK_BYTES));
});

test('planChunk resumes from an arbitrary received offset', () => {
  const p = planChunk(12345, 100_000, CHUNK_GRANULARITY);
  assert.deepEqual([p.start, p.end], [12345, 100_000]);
});

test('Range header parsing gives bytes received', () => {
  assert.equal(receivedFromRangeHeader('bytes=0-1234'), 1235);
  assert.equal(receivedFromRangeHeader(null), 0);
  assert.equal(receivedFromRangeHeader(''), 0);
  assert.equal(receivedFromRangeHeader('bytes=5-10'), null);
  assert.equal(receivedFromRangeHeader('garbage'), null);
  assert.equal(statusQueryRange(99), 'bytes */99');
});

test('Content-Range parsing for relay chunks and status queries', () => {
  assert.deepEqual(parseContentRange('bytes 0-99/100'), { kind: 'chunk', start: 0, end: 99, total: 100 });
  assert.deepEqual(parseContentRange('bytes */100'), { kind: 'query', total: 100 });
  assert.equal(parseContentRange('bytes 10-5/100'), null);
  assert.equal(parseContentRange('bytes 0-100/100'), null);
  assert.equal(parseContentRange('bytes */0'), null);
  assert.equal(parseContentRange(null), null);
  assert.equal(parseContentRange('items 0-1/2'), null);
});

test('validateRelayChunk enforces session size, body length, alignment and max size', () => {
  const total = CHUNK_GRANULARITY * 3 + 5;
  const ok = parseContentRange(`bytes 0-${CHUNK_GRANULARITY - 1}/${total}`);
  assert.equal(validateRelayChunk(ok, CHUNK_GRANULARITY, total, RELAY_CHUNK_BYTES), null);
  assert.equal(validateRelayChunk(ok, CHUNK_GRANULARITY, total + 1, RELAY_CHUNK_BYTES), 'size_mismatch');
  assert.equal(validateRelayChunk(ok, CHUNK_GRANULARITY - 1, total, RELAY_CHUNK_BYTES), 'length_mismatch');
  const odd = parseContentRange(`bytes 0-99/${total}`);
  assert.equal(validateRelayChunk(odd, 100, total, RELAY_CHUNK_BYTES), 'misaligned_chunk');
  const final = parseContentRange(`bytes ${CHUNK_GRANULARITY * 3}-${total - 1}/${total}`);
  assert.equal(validateRelayChunk(final, 5, total, RELAY_CHUNK_BYTES), null);
  const big = parseContentRange(`bytes 0-${RELAY_CHUNK_BYTES * 2 - 1}/${RELAY_CHUNK_BYTES * 3}`);
  assert.equal(validateRelayChunk(big, RELAY_CHUNK_BYTES * 2, RELAY_CHUNK_BYTES * 3, RELAY_CHUNK_BYTES), 'chunk_too_large');
  assert.equal(validateRelayChunk(parseContentRange(`bytes */${total}`), 0, total, RELAY_CHUNK_BYTES), null);
  assert.equal(validateRelayChunk(parseContentRange(`bytes */${total}`), 3, total, RELAY_CHUNK_BYTES), 'unexpected_body');
});

test('Google responses are classified for the upload loop', () => {
  assert.deepEqual(classifyUploadResponse(308, 'bytes=0-99'), { kind: 'incomplete', received: 100 });
  assert.deepEqual(classifyUploadResponse(308, null), { kind: 'incomplete', received: 0 });
  assert.deepEqual(classifyUploadResponse(308, 'weird'), { kind: 'retry' });
  assert.deepEqual(classifyUploadResponse(200, null), { kind: 'complete' });
  assert.deepEqual(classifyUploadResponse(201, null), { kind: 'complete' });
  assert.deepEqual(classifyUploadResponse(503, null), { kind: 'retry' });
  assert.deepEqual(classifyUploadResponse(429, null), { kind: 'retry' });
  assert.deepEqual(classifyUploadResponse(404, null), { kind: 'expired' });
  assert.deepEqual(classifyUploadResponse(410, null), { kind: 'expired' });
  assert.deepEqual(classifyUploadResponse(400, null), { kind: 'fatal' });
  assert.deepEqual(classifyUploadResponse(403, null), { kind: 'fatal' });
});

test('retry delays grow exponentially with jitter and stop after the budget', () => {
  const policy = { maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 5000 };
  assert.equal(retryDelayMs(1, policy, () => 0), 500);
  assert.equal(retryDelayMs(1, policy, () => 1), 1000);
  assert.equal(retryDelayMs(2, policy, () => 1), 2000);
  assert.equal(retryDelayMs(3, policy, () => 1), 4000);
  assert.equal(retryDelayMs(4, policy, () => 1), 5000);
  assert.equal(retryDelayMs(5, policy, () => 1), null);
  assert.equal(retryDelayMs(0, policy, () => 1), null);
});

test('only Google resumable upload URLs are accepted', () => {
  assert.equal(isYouTubeUploadUrl('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&upload_id=abc'), true);
  assert.equal(isYouTubeUploadUrl('http://www.googleapis.com/upload/youtube/v3/videos?upload_id=abc'), false);
  assert.equal(isYouTubeUploadUrl('https://evil.example/upload/youtube/v3/videos?upload_id=abc'), false);
  assert.equal(isYouTubeUploadUrl('https://www.googleapis.com/youtube/v3/videos?upload_id=abc'), false);
  assert.equal(isYouTubeUploadUrl('https://www.googleapis.com/upload/youtube/v3/videos'), false);
  assert.equal(isYouTubeUploadUrl('not a url'), false);
});

test('upload ids and sizes are validated', () => {
  assert.equal(isValidUploadId('a'.repeat(32)), true);
  assert.equal(isValidUploadId('A'.repeat(32)), false);
  assert.equal(isValidUploadId('../x'), false);
  assert.equal(isValidUploadId(null), false);
  assert.equal(isValidUploadSize(1), true);
  assert.equal(isValidUploadSize(0), false);
  assert.equal(isValidUploadSize(1.5), false);
  assert.equal(isValidUploadSize('5'), false);
});

test('resume records drop malformed and expired entries and match by name and size', () => {
  const now = 10_000_000_000;
  const good = {
    uploadId: 'b'.repeat(32), uploadUrl: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=x',
    size: 500, name: 'clip.webm', lastModified: 1, fingerprint: 'f', contentType: 'video/webm', createdAt: now - 1000,
  };
  const old = { ...good, uploadId: 'c'.repeat(32), createdAt: now - RESUMABLE_SESSION_TTL_SECONDS * 1000 - 1 };
  const bad = { ...good, uploadUrl: 'https://evil.example/' };
  const records = parseResumeRecords(JSON.stringify([good, old, bad, 'x']), now);
  assert.deepEqual(records, [good]);
  assert.deepEqual(parseResumeRecords('not json', now), []);
  assert.deepEqual(parseResumeRecords(null, now), []);
  assert.deepEqual(findResumeCandidate(records, { name: 'clip.webm', size: 500 }), good);
  assert.equal(findResumeCandidate(records, { name: 'clip.webm', size: 501 }), null);
});
