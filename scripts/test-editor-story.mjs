import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../lib/editor/model.ts';
import {
  addMedia, addText, editCaption, moveClip, removeClip, removeMedia, removeMusic, setCaptionSettings, setMediaCaptions,
  setMusic, setMuted, setTransition, splitAt, trimClip, updateMusic, updateText,
} from '../lib/editor/ops.ts';
import { clipStarts, duration, locate } from '../lib/editor/timeline.ts';
import { frameAt } from '../lib/render/compose.ts';
import { DUCK_FACTOR, MUSIC_LEVELS, musicGainAt, musicTimeAt } from '../lib/render/audioPlan.ts';

const video = (id, seconds) => ({ id, kind: 'video', name: `${id}.mp4`, size: 1, lastModified: 0, duration: seconds, width: 1920, height: 1080 });
const song = (id, seconds) => ({ id, kind: 'audio', name: `${id}.mp3`, size: 1, lastModified: 0, duration: seconds });
const close = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps, `${actual} ≈ ${expected}`);
const twoClips = () => addMedia(createProject('short'), [video('a', 10), video('b', 10)]);

test('a dissolve overlaps clips and shortens the story by its length', () => {
  let project = twoClips();
  project = setTransition(project, project.story[1].id, { kind: 'dissolve', duration: 1 });
  assert.deepEqual(clipStarts(project), [0, 9]);
  assert.equal(duration(project), 19);
  assert.equal(locate(project, 9.5).clip.mediaId, 'b');
  const mid = frameAt(project, 9.5);
  assert.deepEqual(mid.layers.map((layer) => [layer.clip.mediaId, layer.opacity]), [['a', 1], ['b', 0.5]]);
  close(mid.layers[0].sourceTime, 9.5);
  close(mid.layers[1].sourceTime, 0.5);
  assert.equal(frameAt(project, 10).layers.length, 1);
});

test('a dissolve never takes more than half of a short clip, and is ignored on the first clip', () => {
  let project = twoClips();
  project = trimClip(project, project.story[0].id, 'out', 1);
  project = setTransition(project, project.story[1].id, { kind: 'dissolve', duration: 1 });
  project = setTransition(project, project.story[0].id, { kind: 'dissolve', duration: 1 });
  assert.equal(duration(project), 10.5);
});

test('a fade dips through black without changing length', () => {
  let project = twoClips();
  project = setTransition(project, project.story[1].id, { kind: 'fade', duration: 1 });
  assert.equal(duration(project), 20);
  close(frameAt(project, 9.75).layers[0].opacity, 0.5);
  close(frameAt(project, 10.25).layers[0].opacity, 0.5);
  assert.equal(frameAt(project, 5).layers[0].opacity, 1);
  assert.equal(frameAt(project, 9.75).layers[0].volume, 0.5, 'sound dips with the picture');
});

test('captions use the file’s own time, so they stay in sync through trim, cut and reorder', () => {
  let project = twoClips();
  project = setMediaCaptions(project, 'b', [{ start: 4, end: 6, text: 'hello  there' }, { start: 0, end: 1, text: 'first' }]);
  assert.equal(frameAt(project, 14.5).caption.text, 'hello there');
  project = trimClip(project, project.story[1].id, 'in', 3);
  assert.equal(frameAt(project, 11.5).caption.text, 'hello there');
  project = splitAt(project, 12);
  project = moveClip(project, project.story[1].id, 0);
  assert.equal(frameAt(project, 1.5).caption.text, 'hello there', 'b from 3s to 5s now opens the story');
  assert.equal(frameAt(project, 5).caption, null);
  project = editCaption(project, 'b', 1, 'fixed');
  assert.equal(frameAt(project, 1.5).caption.text, 'fixed');
  project = setCaptionSettings(project, { enabled: false });
  assert.equal(frameAt(project, 1.5).caption, null);
});

test('captions outside the trimmed range never show', () => {
  let project = twoClips();
  project = setMediaCaptions(project, 'a', [{ start: 0, end: 20, text: 'long' }]);
  project = trimClip(project, project.story[0].id, 'out', 5);
  assert.equal(frameAt(project, 4).caption.text, 'long');
  assert.equal(frameAt(project, 5.5).caption, null);
});

test('text is pinned to its clip: it moves with reorder, follows a cut, and goes when the clip goes', () => {
  let project = twoClips();
  const b = project.story[1].id;
  project = addText(project, b, 6, 'Subscribe');
  assert.equal(project.texts[0].duration, 3);
  assert.deepEqual(frameAt(project, 16.5).texts.map((item) => item.text), ['Subscribe']);
  project = moveClip(project, b, 0);
  assert.deepEqual(frameAt(project, 6.5).texts.map((item) => item.text), ['Subscribe']);
  project = splitAt(project, 5);
  assert.equal(project.texts[0].clipId, project.story[1].id);
  assert.equal(project.texts[0].offset, 1);
  assert.deepEqual(frameAt(project, 6.5).texts.map((item) => item.text), ['Subscribe']);
  project = updateText(project, project.texts[0].id, { duration: 0 });
  assert.equal(project.texts[0].duration, 0.5);
  project = removeClip(project, project.story[1].id);
  assert.equal(project.texts.length, 0);
});

test('text never shows past the end of its clip', () => {
  let project = twoClips();
  project = addText(project, project.story[0].id, 9, 'Late');
  project = updateText(project, project.texts[0].id, { duration: 5 });
  assert.equal(frameAt(project, 9.5).texts.length, 1);
  assert.equal(frameAt(project, 10.5).texts.length, 0);
});

test('music: level, ducking under clip sound, gentle start and end, looping', () => {
  let project = twoClips();
  project = setMusic(project, song('m', 8));
  const balanced = MUSIC_LEVELS.balanced;
  close(musicGainAt(project, 5), balanced * DUCK_FACTOR);
  project = setMuted(project, project.story[0].id, true);
  close(musicGainAt(project, 5), balanced);
  close(musicGainAt(project, 0.5), balanced * 0.5, 1e-9);
  close(musicGainAt(project, 19.9), balanced * DUCK_FACTOR * (0.1 / 1.5), 1e-9);
  assert.equal(musicGainAt(project, 25), 0);
  project = updateMusic(project, { duckUnderClips: false, level: 'loud' });
  close(musicGainAt(project, 15), MUSIC_LEVELS.loud);
  assert.equal(musicTimeAt(project, 10), 2);
  project = updateMusic(project, { loop: false });
  assert.equal(musicTimeAt(project, 10), null);
});

test('replacing or removing music drops the old song from the project', () => {
  let project = setMusic(twoClips(), song('m1', 8));
  project = setMusic(project, song('m2', 8));
  assert.equal(project.media.m1, undefined);
  assert.equal(project.music.mediaId, 'm2');
  project = removeMusic(project);
  assert.equal(project.music, null);
  assert.equal(project.media.m2, undefined);
  assert.equal(removeMedia(project, 'a').story.length, 1);
});

test('text wraps by word to fit the safe width and keeps line breaks', async () => {
  const { wrapText } = await import('../lib/render/text.ts');
  const measure = (value) => value.length * 10;
  assert.deepEqual(wrapText(measure, 'one two three four', 90), ['one two', 'three', 'four']);
  assert.deepEqual(wrapText(measure, 'line one\nline two', 1000), ['line one', 'line two']);
  assert.deepEqual(wrapText(measure, 'supercalifragilistic', 50), ['supercalifragilistic']);
  assert.deepEqual(wrapText(measure, '   ', 50), []);
});
