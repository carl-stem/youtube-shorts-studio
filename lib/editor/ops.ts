// Edit operations: pure (Project, args) => Project. An operation that changes
// nothing returns the same object, which history.ts treats as a no-op.

import type { VideoFilter } from '../../types';
import { panPresetFraming, type Framing } from '../render/layout';
import { MIN_CLIP_SECONDS, makeId, type Id, type MediaRef, type Project, type Seconds, type StoryClip } from './model';
import { locate } from './timeline';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function touch(project: Project, patch: Partial<Project>): Project {
  return { ...project, ...patch, updatedAt: new Date().toISOString() };
}

function updateClip(project: Project, clipId: Id, update: (clip: StoryClip) => StoryClip): Project {
  const index = project.story.findIndex((clip) => clip.id === clipId);
  if (index < 0) return project;
  const next = update(project.story[index]);
  if (next === project.story[index]) return project;
  const story = project.story.slice();
  story[index] = next;
  return touch(project, { story });
}

function newClip(media: MediaRef, maxSeconds: Seconds | null): StoryClip {
  const out = maxSeconds === null ? media.duration : Math.min(media.duration, maxSeconds);
  return { id: makeId(), mediaId: media.id, in: 0, out, framing: panPresetFraming('center'), look: 'original', muted: false };
}

/** Adds files to the project and puts one clip of each at the end of the story. */
export function addMedia(project: Project, items: MediaRef[], maxClipSeconds: Seconds | null = null): Project {
  if (!items.length) return project;
  const media = { ...project.media };
  for (const item of items) media[item.id] = item;
  return touch(project, { media, story: [...project.story, ...items.map((item) => newClip(item, maxClipSeconds))] });
}

/** Adds another clip of an already imported file to the end of the story. */
export function appendClip(project: Project, mediaId: Id, maxClipSeconds: Seconds | null = null): Project {
  const media = project.media[mediaId];
  if (!media) return project;
  return touch(project, { story: [...project.story, newClip(media, maxClipSeconds)] });
}

/** Removes a file and every clip made from it. */
export function removeMedia(project: Project, mediaId: Id): Project {
  if (!project.media[mediaId]) return project;
  const media = { ...project.media };
  delete media[mediaId];
  return touch(project, { media, story: project.story.filter((clip) => clip.mediaId !== mediaId) });
}

export function removeClip(project: Project, clipId: Id): Project {
  if (!project.story.some((clip) => clip.id === clipId)) return project;
  return touch(project, { story: project.story.filter((clip) => clip.id !== clipId) });
}

export function moveClip(project: Project, clipId: Id, toIndex: number): Project {
  const from = project.story.findIndex((clip) => clip.id === clipId);
  if (from < 0) return project;
  const to = clamp(Math.round(toIndex), 0, project.story.length - 1);
  if (to === from) return project;
  const story = project.story.slice();
  const [clip] = story.splice(from, 1);
  story.splice(to, 0, clip);
  return touch(project, { story });
}

/** Moves one edge of a clip, keeping it inside its media and at least MIN_CLIP_SECONDS long. */
export function trimClip(project: Project, clipId: Id, edge: 'in' | 'out', sourceTime: Seconds): Project {
  return updateClip(project, clipId, (clip) => {
    const mediaDuration = project.media[clip.mediaId]?.duration ?? clip.out;
    const value = edge === 'in'
      ? clamp(sourceTime, 0, clip.out - MIN_CLIP_SECONDS)
      : clamp(sourceTime, clip.in + MIN_CLIP_SECONDS, mediaDuration);
    return value === clip[edge] ? clip : { ...clip, [edge]: value };
  });
}

/** Cuts a clip in two at a time inside its media. Too close to an edge does nothing. */
export function splitClip(project: Project, clipId: Id, sourceTime: Seconds): Project {
  const index = project.story.findIndex((clip) => clip.id === clipId);
  if (index < 0) return project;
  const clip = project.story[index];
  if (sourceTime - clip.in < MIN_CLIP_SECONDS || clip.out - sourceTime < MIN_CLIP_SECONDS) return project;
  const story = project.story.slice();
  story.splice(index, 1, { ...clip, out: sourceTime }, { ...clip, id: makeId(), in: sourceTime });
  return touch(project, { story });
}

/** "Cut here" at a timeline time. */
export function splitAt(project: Project, timelineTime: Seconds): Project {
  const hit = locate(project, timelineTime);
  return hit ? splitClip(project, hit.clip.id, hit.sourceTime) : project;
}

export function setFraming(project: Project, clipId: Id, framing: Framing): Project {
  return updateClip(project, clipId, (clip) => ({ ...clip, framing }));
}

export function setLook(project: Project, clipId: Id, look: VideoFilter): Project {
  return updateClip(project, clipId, (clip) => (clip.look === look ? clip : { ...clip, look }));
}

export function setMuted(project: Project, clipId: Id, muted: boolean): Project {
  return updateClip(project, clipId, (clip) => (clip.muted === muted ? clip : { ...clip, muted }));
}
