import test from 'node:test';
import assert from 'node:assert/strict';
import { pairCaptions } from '../lib/media/pairCaptions.ts';

test('captions pair with the video of the same name, including language suffixes', () => {
  const pairs = pairCaptions(['clips/Talk.mp4', 'clips/broll.mov'], ['clips/talk.srt', 'subs/broll.en.vtt', 'other.srt']);
  assert.equal(pairs.get('clips/talk.srt'), 'clips/Talk.mp4');
  assert.equal(pairs.get('subs/broll.en.vtt'), 'clips/broll.mov');
  assert.equal(pairs.has('other.srt'), false);
});

test('with a single video every caption file belongs to it', () => {
  const pairs = pairCaptions(['only.mp4'], ['whatever.srt']);
  assert.equal(pairs.get('whatever.srt'), 'only.mp4');
});
