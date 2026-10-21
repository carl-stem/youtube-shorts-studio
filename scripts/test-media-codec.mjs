import test from 'node:test';
import assert from 'node:assert/strict';
import { SSR_CODEC_INFO, getSupportedMimeType } from '../lib/mediaCodec.ts';

// Components render once on the server (no window) and hydrate on the client.
// They must use SSR_CODEC_INFO for the first render and only switch to the
// detected codec after mount, otherwise server and client markup differ.

test('returns the shared SSR placeholder when window is unavailable', () => {
  assert.equal(typeof window, 'undefined');
  assert.deepEqual(SSR_CODEC_INFO, { mime: '', ext: 'webm', label: 'SSR' });
  assert.deepEqual(getSupportedMimeType(), SSR_CODEC_INFO);
});

test('detects a different codec in the browser, so it must not run during render', () => {
  const g = globalThis;
  g.window = { MediaRecorder: true };
  g.MediaRecorder = { isTypeSupported: (mime) => mime.startsWith('video/mp4') };
  try {
    const detected = getSupportedMimeType();
    assert.equal(detected.ext, 'mp4');
    assert.notDeepEqual(detected, SSR_CODEC_INFO);
  } finally {
    delete g.window;
    delete g.MediaRecorder;
  }
});

test('Studio does not detect the codec in a render-time hook initializer', async () => {
  // Source-level guard: React has no server renderer test harness here, so this
  // pins the specific regression (detection inside useRef/useState/useMemo init).
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../components/Studio.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /use(?:Ref|State|Memo)\([^;]*?getSupportedMimeType\(\)/s);
});
