import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { extractZipMedia, listZipMedia, parseCaptionFile } from '../lib/videoAssets.ts';

const encoder = new TextEncoder();
const bytes = (value) => encoder.encode(value);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index++) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = bytes(entry.name);
    const source = bytes(entry.content);
    const method = entry.method ?? 8;
    const compressed = method === 8 ? deflateRawSync(source) : source;
    const crc = crc32(source);
    const local = new Uint8Array(30 + name.length + compressed.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x800, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, compressed.length, true);
    localView.setUint32(22, source.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(compressed, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, (3 << 8) | 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x800, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, compressed.length, true);
    centralView.setUint32(24, source.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centrals.push(central);
    localOffset += local.length;
  }
  const centralSize = centrals.reduce((size, part) => size + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  const result = new Uint8Array(localOffset + centralSize + end.length);
  let offset = 0;
  for (const part of [...locals, ...centrals, end]) { result.set(part, offset); offset += part.length; }
  return result;
}

test('lists and extracts selected video and caption files from a ZIP', async () => {
  const archive = makeZip([
    { name: 'assets/clip.mp4', content: 'video-bytes' },
    { name: 'assets/captions.srt', content: '1\n00:00:00,000 --> 00:00:01,000\nHello video' },
    { name: 'notes.txt', content: 'ignored' },
  ]);
  const file = new File([archive], 'assets.zip', { type: 'application/zip' });
  const candidates = await listZipMedia(file);
  assert.deepEqual(candidates.map(({ name, kind }) => [name, kind]), [
    ['assets/clip.mp4', 'video'],
    ['assets/captions.srt', 'captions'],
  ]);
  const extracted = await extractZipMedia(file, candidates);
  assert.equal(await extracted[0].file.text(), 'video-bytes');
  assert.equal(extracted[0].file.type, 'video/mp4');
  assert.equal(await extracted[1].file.text(), '1\n00:00:00,000 --> 00:00:01,000\nHello video');
});

test('rejects unsafe archive paths during inspection', async () => {
  const file = new File([makeZip([{ name: '../escape.mp4', content: 'bad' }])], 'unsafe.zip');
  await assert.rejects(listZipMedia(file), /unsafe path/);
});

test('rejects corrupt archives and damaged entry content', async () => {
  await assert.rejects(listZipMedia(new File([bytes('not a zip')], 'broken.zip')), /incomplete or invalid/);
  const archive = makeZip([{ name: 'clip.mp4', content: 'original', method: 0 }]);
  const file = new File([archive], 'clip.zip');
  const candidates = await listZipMedia(file);
  const damaged = new Uint8Array(archive);
  const entry = candidates[0];
  damaged[entry.localHeaderOffset + 30 + 'clip.mp4'.length] ^= 0xff;
  await assert.rejects(extractZipMedia(new File([damaged], 'damaged.zip'), candidates), /checksum/);
});

test('parses SRT and VTT timestamps and ignores malformed caption cues', () => {
  const srt = '1\n00:00:00,500 --> 00:00:02,000\nFirst caption\n\ninvalid cue';
  assert.deepEqual(parseCaptionFile(srt), [{ start: 0.5, end: 2, text: 'First caption' }]);
  const vtt = 'WEBVTT\n\ncaption-1\n00:00:01.000 --> 00:00:02.250\nSecond caption';
  assert.deepEqual(parseCaptionFile(vtt), [{ start: 1, end: 2.25, text: 'Second caption' }]);
});
