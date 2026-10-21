import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_CLIP_SECONDS, createProject } from '../lib/editor/model.ts';
import {
  addMedia, appendClip, moveClip, removeClip, removeMedia, setLook, setMuted, splitAt, splitClip, trimClip,
} from '../lib/editor/ops.ts';
import { clipStarts, duration, formatTimecode, locate } from '../lib/editor/timeline.ts';
import { HISTORY_LIMIT, createHistory, historyReducer, redoLabel, undoLabel } from '../lib/editor/history.ts';
import { FORMATS, framingPreset, framingRect, panPresetFraming } from '../lib/render/layout.ts';

const media = (id, seconds) => ({ id, kind: 'video', name: `${id}.mp4`, size: 1000, lastModified: 0, duration: seconds, width: 1920, height: 1080 });
const threeClips = () => addMedia(createProject('short'), [media('a', 10), media('b', 20), media('c', 5)]);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test('adding media appends one full clip per file, capped for Shorts', () => {
  const project = addMedia(createProject('short'), [media('a', 10), media('long', 600)], 60);
  assert.deepEqual(project.story.map((clip) => [clip.mediaId, clip.in, clip.out]), [['a', 0, 10], ['long', 0, 60]]);
  assert.equal(Object.keys(project.media).length, 2);
  assert.equal(addMedia(project, []), project);
});

test('timeline positions are derived from clip lengths', () => {
  const project = threeClips();
  assert.deepEqual(clipStarts(project), [0, 10, 30]);
  assert.equal(duration(project), 35);
  assert.equal(duration(createProject('short')), 0);
});

test('locate maps timeline time to the clip and source time; a cut belongs to the next clip', () => {
  let project = threeClips();
  project = trimClip(project, project.story[1].id, 'in', 4);
  assert.equal(locate(project, 0).clip.mediaId, 'a');
  const onCut = locate(project, 10);
  assert.equal(onCut.clip.mediaId, 'b');
  assert.equal(onCut.sourceTime, 4);
  assert.equal(locate(project, 12.5).sourceTime, 6.5);
  const end = locate(project, 999);
  assert.equal(end.index, 2);
  assert.equal(end.sourceTime, 5);
  assert.equal(locate(createProject('short'), 0), null);
});

test('trim keeps clips inside their media and at least the minimum length', () => {
  let project = threeClips();
  const id = project.story[0].id;
  project = trimClip(project, id, 'in', 3);
  project = trimClip(project, id, 'out', 50);
  assert.deepEqual([project.story[0].in, project.story[0].out], [3, 10]);
  project = trimClip(project, id, 'in', 10);
  close(project.story[0].in, 10 - MIN_CLIP_SECONDS);
  project = trimClip(project, id, 'out', 0);
  close(project.story[0].out, project.story[0].in + MIN_CLIP_SECONDS);
  assert.equal(trimClip(project, 'missing', 'in', 1), project);
});

test('split cuts a clip in two without changing total length, and refuses tiny pieces', () => {
  const project = threeClips();
  const cut = splitAt(project, 14);
  assert.equal(cut.story.length, 4);
  assert.deepEqual(cut.story.slice(1, 3).map((clip) => [clip.mediaId, clip.in, clip.out]), [['b', 0, 4], ['b', 4, 20]]);
  assert.notEqual(cut.story[1].id, cut.story[2].id);
  assert.equal(duration(cut), duration(project));
  assert.equal(splitClip(project, project.story[0].id, MIN_CLIP_SECONDS / 2), project);
  assert.equal(splitAt(createProject('short'), 1).story.length, 0);
});

test('move reorders clips and clamps the target index', () => {
  const project = threeClips();
  const moved = moveClip(project, project.story[2].id, 0);
  assert.deepEqual(moved.story.map((clip) => clip.mediaId), ['c', 'a', 'b']);
  assert.deepEqual(moveClip(project, project.story[0].id, 99).story.map((clip) => clip.mediaId), ['b', 'c', 'a']);
  assert.equal(moveClip(project, project.story[1].id, 1), project);
});

test('remove clip keeps the media; remove media drops its clips', () => {
  let project = appendClip(threeClips(), 'a');
  assert.equal(project.story.length, 4);
  const withoutClip = removeClip(project, project.story[0].id);
  assert.equal(withoutClip.story.length, 3);
  assert.ok(withoutClip.media.a);
  project = removeMedia(project, 'a');
  assert.deepEqual(project.story.map((clip) => clip.mediaId), ['b', 'c']);
  assert.equal(project.media.a, undefined);
  assert.equal(appendClip(project, 'a'), project);
});

test('look and mute changes are no-ops when unchanged', () => {
  const project = threeClips();
  const id = project.story[0].id;
  assert.equal(setLook(project, id, 'original'), project);
  assert.equal(setLook(project, id, 'warm').story[0].look, 'warm');
  assert.equal(setMuted(project, id, true).story[0].muted, true);
});

test('history: undo and redo restore snapshots with labels', () => {
  let history = createHistory(threeClips());
  const start = history.present;
  history = historyReducer(history, { type: 'apply', op: (p) => splitAt(p, 14), label: 'Cut clip' });
  history = historyReducer(history, { type: 'apply', op: (p) => moveClip(p, p.story[0].id, 3), label: 'Move clip' });
  assert.equal(undoLabel(history), 'Move clip');
  history = historyReducer(history, { type: 'undo' });
  history = historyReducer(history, { type: 'undo' });
  assert.equal(history.present, start);
  assert.equal(redoLabel(history), 'Cut clip');
  history = historyReducer(history, { type: 'redo' });
  assert.equal(history.present.story.length, 4);
  history = historyReducer(history, { type: 'apply', op: (p) => removeClip(p, p.story[0].id), label: 'Delete clip' });
  assert.equal(history.future.length, 0, 'a new edit clears redo');
});

test('history: no-op edits are not recorded and slider drags coalesce until sealed', () => {
  let history = createHistory(threeClips());
  const id = history.present.story[0].id;
  history = historyReducer(history, { type: 'apply', op: (p) => p, label: 'Nothing' });
  assert.equal(history.past.length, 0);
  for (const t of [1, 2, 3]) history = historyReducer(history, { type: 'apply', op: (p) => trimClip(p, id, 'in', t), label: 'Trim clip', coalesceKey: `trim:${id}` });
  assert.equal(history.past.length, 1);
  history = historyReducer(history, { type: 'seal' });
  history = historyReducer(history, { type: 'apply', op: (p) => trimClip(p, id, 'in', 4), label: 'Trim clip', coalesceKey: `trim:${id}` });
  assert.equal(history.past.length, 2);
  history = historyReducer(history, { type: 'undo' });
  assert.equal(history.present.story[0].in, 3);
  history = historyReducer(history, { type: 'undo' });
  assert.equal(history.present.story[0].in, 0);
});

test('history keeps at most HISTORY_LIMIT undo steps', () => {
  let history = createHistory(0);
  for (let i = 1; i <= HISTORY_LIMIT + 20; i += 1) history = historyReducer(history, { type: 'apply', op: () => i, label: 'Set' });
  assert.equal(history.past.length, HISTORY_LIMIT);
  assert.equal(history.past[0].state, 20);
});

test('fill framing covers the frame; pan presets show the matching side of wide footage', () => {
  const { width, height } = FORMATS.short;
  const center = framingRect(1920, 1080, width, height, panPresetFraming('center'));
  assert.equal(center.height, height);
  close(center.x, (width - center.width) / 2);
  assert.equal(framingRect(1920, 1080, width, height, panPresetFraming('left')).x, 0);
  close(framingRect(1920, 1080, width, height, panPresetFraming('right')).x, width - center.width);
  const fit = framingRect(1920, 1080, width, height, { mode: 'fit', background: 'blur' });
  assert.equal(fit.width, width);
  close(fit.y, (height - fit.height) / 2);
  assert.equal(framingPreset(panPresetFraming('right')), 'right');
  assert.equal(framingPreset({ mode: 'fill', zoom: 1.5, panX: 0, panY: 0 }), 'custom');
});

test('timecodes', () => {
  assert.equal(formatTimecode(0), '0:00');
  assert.equal(formatTimecode(75.9), '1:15');
  assert.equal(formatTimecode(3725), '1:02:05');
});
