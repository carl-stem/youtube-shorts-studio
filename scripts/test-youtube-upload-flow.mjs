// Drives lib/publish/youtubeUpload.ts against an in-memory fake of Google's
// resumable endpoint and the app's session/chunk routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The module imports './resumable' without an extension (bundler resolution), which
// Node cannot resolve, so load a copy whose import points at the real file.
async function loadUploader() {
  const source = await readFile(new URL('../lib/publish/youtubeUpload.ts', import.meta.url), 'utf8');
  const resumable = new URL('../lib/publish/resumable.ts', import.meta.url).href;
  const patched = source.replace("from './resumable'", `from '${resumable}'`);
  assert.notEqual(patched, source);
  const dir = await mkdtemp(join(tmpdir(), 'yt-upload-'));
  const file = join(dir, 'youtubeUpload.ts');
  await writeFile(file, patched);
  return import(pathToFileURL(file).href);
}

const MiB = 1024 * 1024;
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=fake';
const UPLOAD_ID = 'a'.repeat(32);

function makeEnv({ corsBlocked = false, exposeRange = true, dropRelayChunks = 0 } = {}) {
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
  const google = { received: 0, total: 0, done: false };
  const calls = [];
  let drops = dropRelayChunks;

  const googlePut = (range, bytes) => {
    if (range.startsWith('bytes */')) {
      return google.done ? { status: 200, range: null, id: 'vid_123456' } : { status: 308, range: google.received ? `bytes=0-${google.received - 1}` : null };
    }
    const [, start, end, total] = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range).map(Number);
    assert.equal(start, google.received, 'chunks must continue from the received offset');
    assert.equal(end - start + 1, bytes);
    google.total = total;
    google.received = end + 1;
    if (google.received === total) { google.done = true; return { status: 200, range: null, id: 'vid_123456' }; }
    return { status: 308, range: `bytes=0-${google.received - 1}` };
  };

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const bytes = init.body ? init.body.size : 0;
    const range = init.headers?.['Content-Range'];
    if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    if (href === '/api/upload/youtube/session') {
      calls.push(['session']);
      return Response.json({ uploadId: UPLOAD_ID, uploadUrl: UPLOAD_URL, chunkSize: 8 * MiB, contentType: 'video/webm' });
    }
    if (href.startsWith('/api/upload/youtube/chunk')) {
      calls.push(['relay', range, bytes]);
      assert.ok(bytes <= 4 * MiB, 'relay chunks must fit under the body limit');
      if (bytes > 0 && drops > 0) { drops -= 1; throw new TypeError('network down'); }
      const r = googlePut(range, bytes);
      if (r.status === 200) return Response.json({ state: 'complete', videoId: r.id, tracked: true });
      return Response.json({ state: 'incomplete', received: r.range ? Number(r.range.split('-')[1]) + 1 : 0 });
    }
    if (href === UPLOAD_URL) {
      calls.push(['direct', range, bytes]);
      if (corsBlocked) throw new TypeError('Failed to fetch');
      const r = googlePut(range, bytes);
      const headers = new Headers();
      if (r.range && exposeRange) headers.set('range', r.range);
      return r.status === 200 ? new Response(JSON.stringify({ id: r.id }), { status: 200, headers }) : new Response(null, { status: 308, headers });
    }
    throw new Error(`unexpected fetch ${href}`);
  };
  return { google, calls, store };
}

const draft = { title: 'T', description: '', tags: '', privacy: 'private', publishAt: null, categoryId: '22', madeForKids: false };
const makeFile = (size) => new File([new Uint8Array(size)], 'clip.webm', { type: 'video/webm', lastModified: 1 });

test('direct upload sends 8 MiB chunks to Google and confirms completion through the relay', async () => {
  const { uploadToYouTube } = await loadUploader();
  const env = makeEnv();
  const progress = [];
  const result = await uploadToYouTube(makeFile(20 * MiB), draft, { onProgress: (p) => progress.push(p) });
  assert.equal(result.mode, 'direct');
  assert.equal(result.videoId, 'vid_123456');
  assert.equal(result.tracked, true);
  assert.deepEqual(env.calls.filter((c) => c[0] === 'direct').map((c) => c[2]), [8 * MiB, 8 * MiB, 4 * MiB]);
  assert.deepEqual(env.calls.at(-1), ['relay', `bytes */${20 * MiB}`, 0]);
  assert.equal(progress.at(-1).sentBytes, 20 * MiB);
  assert.equal(env.store.get('shorts-studio:youtube-resumable'), '[]', 'resume record is cleared on success');
});

test('when Google hides the Range header, progress is learned from the relay', async () => {
  const { uploadToYouTube } = await loadUploader();
  const env = makeEnv({ exposeRange: false });
  const result = await uploadToYouTube(makeFile(10 * MiB), draft);
  assert.equal(result.mode, 'direct');
  assert.deepEqual(env.calls.map((c) => c[0]), ['session', 'direct', 'relay', 'direct', 'relay']);
});

test('a CORS failure on the first direct chunk switches to 4 MiB relay chunks', async () => {
  const { uploadToYouTube } = await loadUploader();
  const env = makeEnv({ corsBlocked: true });
  const modes = new Set();
  const result = await uploadToYouTube(makeFile(9 * MiB), draft, { onProgress: (p) => modes.add(p.mode) });
  assert.equal(result.mode, 'relay');
  assert.deepEqual([...modes], ['direct', 'relay']);
  assert.equal(env.calls.filter((c) => c[0] === 'direct').length, 1);
  assert.deepEqual(env.calls.filter((c) => c[0] === 'relay' && c[2] > 0).map((c) => c[2]), [4 * MiB, 4 * MiB, 1 * MiB]);
});

test('a dropped relay chunk is retried from the received offset after backoff', async () => {
  const { uploadToYouTube } = await loadUploader();
  const env = makeEnv({ corsBlocked: true, dropRelayChunks: 1 });
  const retries = [];
  const result = await uploadToYouTube(makeFile(5 * MiB), draft, { onProgress: (p) => { if (p.retryInSeconds) retries.push(p.retryInSeconds); } });
  assert.equal(result.videoId, 'vid_123456');
  assert.equal(retries.length, 1);
  assert.equal(env.google.received, 5 * MiB);
});

test('cancel stops the upload and keeps the resume record', async () => {
  const { uploadToYouTube, findResumableUpload } = await loadUploader();
  makeEnv({ corsBlocked: true });
  const controller = new AbortController();
  const file = makeFile(12 * MiB);
  await assert.rejects(
    uploadToYouTube(file, draft, { signal: controller.signal, onProgress: (p) => { if (p.sentBytes >= 4 * MiB) controller.abort(); } }),
    (error) => error.code === 'cancelled',
  );
  assert.equal(findResumableUpload(file)?.uploadId, UPLOAD_ID);
});

test('resume continues from the bytes Google already has', async () => {
  const { uploadToYouTube, resumeYouTubeUpload, findResumableUpload } = await loadUploader();
  const env = makeEnv({ corsBlocked: true });
  const controller = new AbortController();
  const file = makeFile(12 * MiB);
  await uploadToYouTube(file, draft, { signal: controller.signal, onProgress: (p) => { if (p.sentBytes >= 8 * MiB) controller.abort(); } }).catch(() => {});
  const record = findResumableUpload(file);
  const before = env.google.received;
  const result = await resumeYouTubeUpload(file, record);
  assert.equal(result.videoId, 'vid_123456');
  const sent = env.calls.filter((c) => c[0] === 'relay' && c[2] > 0).reduce((n, c) => n + c[2], 0);
  assert.equal(sent, 12 * MiB, 'no byte is sent twice');
  assert.ok(before >= 8 * MiB);
});

test('resume refuses a different file with the same name and size', async () => {
  const { resumeYouTubeUpload } = await loadUploader();
  makeEnv();
  const record = {
    uploadId: UPLOAD_ID, uploadUrl: UPLOAD_URL, size: MiB, name: 'clip.webm', lastModified: 1,
    fingerprint: 'not-this-file', contentType: 'video/webm', createdAt: Date.now(),
  };
  await assert.rejects(resumeYouTubeUpload(makeFile(MiB), record), (error) => error.code === 'resume_mismatch');
});
