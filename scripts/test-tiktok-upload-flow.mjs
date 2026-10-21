// Drives lib/publish/tiktokUpload.ts against an in-memory fake of TikTok's
// FILE_UPLOAD endpoint and the app's init/relay routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { planTikTokChunks } from '../lib/publish/tiktokChunks.ts';

// The modules use extensionless relative imports (bundler resolution); load copies
// whose imports point at the real files.
async function loadUploader() {
  const lib = (name) => new URL(`../lib/publish/${name}.ts`, import.meta.url);
  const dir = await mkdtemp(join(tmpdir(), 'tt-upload-'));
  const rewrite = (source) => source
    .replace(/from '\.\/resumable'/g, `from '${lib('resumable').href}'`)
    .replace(/from '\.\/tiktokChunks'/g, `from '${lib('tiktokChunks').href}'`)
    .replace(/from '\.\/youtubeUpload'/g, `from '${pathToFileURL(join(dir, 'youtubeUpload.ts')).href}'`);
  await writeFile(join(dir, 'youtubeUpload.ts'), rewrite(await readFile(lib('youtubeUpload'), 'utf8')));
  await writeFile(join(dir, 'tiktokUpload.ts'), rewrite(await readFile(lib('tiktokUpload'), 'utf8')));
  return import(pathToFileURL(join(dir, 'tiktokUpload.ts')).href);
}

const MB = 1024 * 1024;
const UPLOAD_URL = 'https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x';

function makeEnv({ corsBlocked = false, failOnce = false } = {}) {
  const calls = [];
  let failed = false;
  let received = 0;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href === '/api/upload/tiktok/init') {
      const { size, contentType } = JSON.parse(init.body);
      assert.equal(contentType, 'video/webm;codecs=vp9,opus');
      const plan = planTikTokChunks(size);
      calls.push(['init']);
      return Response.json({ publishId: 'v_inbox_file~v2.1', uploadUrl: UPLOAD_URL, contentType: 'video/webm', chunkSize: plan.chunkSize, totalChunkCount: plan.totalChunkCount });
    }
    if (href.startsWith('/api/upload/tiktok/chunk')) {
      calls.push(['relay', init.body.size]);
      return Response.json({ state: 'complete' });
    }
    if (href === UPLOAD_URL) {
      calls.push(['direct', init.headers['Content-Range'], init.body.size]);
      if (corsBlocked) throw new TypeError('Failed to fetch');
      if (failOnce && !failed && received > 0) { failed = true; return new Response(null, { status: 503 }); }
      const [, start, end, total] = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(init.headers['Content-Range']).map(Number);
      assert.equal(start, received);
      assert.equal(init.headers['Content-Type'], 'video/webm');
      received = end + 1;
      return new Response(null, { status: received === total ? 201 : 206 });
    }
    throw new Error(`unexpected fetch ${href}`);
  };
  return calls;
}

const makeFile = (size) => new File([new Uint8Array(size)], 'clip.webm', { type: 'video/webm;codecs=vp9,opus' });

test('chunks go straight to TikTok in order and finish on 201', async () => {
  const { uploadToTikTok } = await loadUploader();
  const calls = makeEnv();
  const result = await uploadToTikTok(makeFile(25 * MB));
  assert.deepEqual(result, { publishId: 'v_inbox_file~v2.1', mode: 'direct' });
  assert.deepEqual(calls.filter((c) => c[0] === 'direct').map((c) => c[2]), [10 * MB, 15 * MB]);
});

test('a 503 on a chunk is retried after backoff', async () => {
  const { uploadToTikTok } = await loadUploader();
  const calls = makeEnv({ failOnce: true });
  const retries = [];
  await uploadToTikTok(makeFile(30 * MB), { onProgress: (p) => { if (p.retryInSeconds) retries.push(p.retryInSeconds); } });
  assert.equal(retries.length, 1);
  assert.equal(calls.filter((c) => c[0] === 'direct').length, 4);
});

test('blocked direct upload: tiny files use the relay, larger files get a clear error', async () => {
  const { uploadToTikTok } = await loadUploader();
  let calls = makeEnv({ corsBlocked: true });
  assert.deepEqual(await uploadToTikTok(makeFile(3 * MB)), { publishId: 'v_inbox_file~v2.1', mode: 'relay' });
  assert.deepEqual(calls.at(-1), ['relay', 3 * MB]);
  calls = makeEnv({ corsBlocked: true });
  await assert.rejects(uploadToTikTok(makeFile(20 * MB)), (e) => e.code === 'tiktok_direct_blocked' && /TikTok app/.test(e.message));
  assert.equal(calls.filter((c) => c[0] === 'relay').length, 0);
});
