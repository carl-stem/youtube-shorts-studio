import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProject } from '../lib/editor/model.ts';
import { addMedia, addText, renameProject, setMediaCaptions, setMusic, updateCaption } from '../lib/editor/ops.ts';
import { parseProject, serializeProject } from '../lib/editor/schema.ts';
import { duration } from '../lib/editor/timeline.ts';
import { parseCaptionReport } from '../lib/media/captions.ts';

const fixture = async () => readFile(new URL('./fixtures/editor-project-v1.json', import.meta.url), 'utf8');

test('a version 1 project file opens with every setting restored', async () => {
  const result = parseProject(await fixture());
  assert.equal(result.ok, true);
  const { project } = result;
  assert.equal(project.name, 'Beach day');
  assert.deepEqual(project.story.map((clip) => [clip.mediaId, clip.in, clip.out, clip.look, clip.muted]), [['v1', 0.5, 6, 'warm', false], ['v2', 0, 5, 'original', true]]);
  assert.deepEqual(project.story[0].framing, { mode: 'fill', zoom: 1.2, panX: 0.5, panY: 0 });
  assert.deepEqual(project.story[1].transitionIn, { kind: 'dissolve', duration: 1 });
  assert.equal(project.media.v1.captions[0].text, 'Look at the waves');
  assert.equal(project.texts[0].text, 'Beach day!');
  assert.deepEqual(project.music, { mediaId: 'm1', level: 'quiet', duckUnderClips: true, loop: false });
  assert.equal(duration(project), 9.5);
});

test('save then open gives back the same project', () => {
  let project = addMedia(createProject('short'), [{ id: 'a', kind: 'video', name: 'a.mp4', size: 1, lastModified: 0, duration: 10, width: 1920, height: 1080 }]);
  project = addText(project, project.story[0].id, 1, 'Hi');
  project = setMediaCaptions(project, 'a', [{ start: 0, end: 1, text: 'x' }]);
  project = setMusic(project, { id: 'm', kind: 'audio', name: 'm.mp3', size: 1, lastModified: 0, duration: 5 });
  project = renameProject(project, 'My trip');
  const reopened = parseProject(serializeProject(project));
  assert.equal(reopened.ok, true);
  assert.deepEqual(reopened.project, project);
});

test('damaged, foreign or newer files are rejected with a useful message', async () => {
  const good = JSON.parse(await fixture());
  const cases = [
    ['not json', /not a Shorts Studio project/],
    [JSON.stringify({ hello: 'world' }), /not a Shorts Studio project/],
    [JSON.stringify({ ...good, schemaVersion: 99 }), /newer version/],
    [JSON.stringify({ ...good, story: [{ ...good.story[0], mediaId: 'nope' }] }), /damaged.*not in the project/],
    [JSON.stringify({ ...good, story: [{ ...good.story[0], in: 5, out: 2 }] }), /damaged.*impossible/],
    [JSON.stringify({ ...good, media: 'x' }), /damaged/],
  ];
  for (const [input, message] of cases) {
    const result = parseProject(input);
    assert.equal(result.ok, false, String(input).slice(0, 40));
    assert.match(result.error, message);
  }
});

test('optional parts missing from a file get safe defaults', async () => {
  const good = JSON.parse(await fixture());
  delete good.texts; delete good.captions; delete good.music;
  good.story[0].look = 'neon';
  const result = parseProject(good);
  assert.equal(result.ok, true);
  assert.deepEqual(result.project.texts, []);
  assert.deepEqual(result.project.captions, { enabled: true, style: 'boxed' });
  assert.equal(result.project.music, null);
  assert.equal(result.project.story[0].look, 'original');
});

test('caption timing can be corrected, and a cue always ends after it starts', () => {
  let project = addMedia(createProject('short'), [{ id: 'a', kind: 'video', name: 'a.mp4', size: 1, lastModified: 0, duration: 10, width: 1, height: 1 }]);
  project = setMediaCaptions(project, 'a', [{ start: 1, end: 2, text: 'one' }]);
  project = updateCaption(project, 'a', 0, { start: 1.5 });
  assert.deepEqual(project.media.a.captions[0], { start: 1.5, end: 2, text: 'one' });
  project = updateCaption(project, 'a', 0, { end: 0 });
  assert.deepEqual(project.media.a.captions[0], { start: 1.5, end: 1.6, text: 'one' });
  assert.equal(updateCaption(project, 'a', 5, { text: 'x' }), project);
});

test('caption files report entries that could not be read', () => {
  const text = '1\n00:00:01,000 --> 00:00:02,000\nGood\n\n2\n00:00:0x,000 --> broken\nBad\n\n3\n00:00:03,000 --> 00:00:04,000\nAlso good\n';
  const report = parseCaptionReport(text);
  assert.equal(report.cues.length, 2);
  assert.equal(report.unreadable, 1);
});
