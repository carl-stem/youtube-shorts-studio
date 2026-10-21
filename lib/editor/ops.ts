// Edit operations: pure (Project, args) => Project. An operation that changes
// nothing returns the same object, which history.ts treats as a no-op.

import type { SRTCue, VideoFilter } from '../../types';
import { panPresetFraming, type Framing } from '../render/layout';
import {
  CUT, MIN_CLIP_SECONDS, makeId,
  type AudioMedia, type CaptionSettings, type Id, type MusicBed, type Project, type Seconds, type StoryClip,
  type TextItem, type Transition, type VideoMedia,
} from './model';
import { clipLength, locate } from './timeline';

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

function newClip(media: VideoMedia, maxSeconds: Seconds | null): StoryClip {
  const out = maxSeconds === null ? media.duration : Math.min(media.duration, maxSeconds);
  return { id: makeId(), mediaId: media.id, in: 0, out, framing: panPresetFraming('center'), look: 'original', muted: false, transitionIn: CUT };
}

/** Adds video files to the project and puts one clip of each at the end of the story. */
export function addMedia(project: Project, items: VideoMedia[], maxClipSeconds: Seconds | null = null): Project {
  if (!items.length) return project;
  const media = { ...project.media };
  for (const item of items) media[item.id] = item;
  return touch(project, { media, story: [...project.story, ...items.map((item) => newClip(item, maxClipSeconds))] });
}

/** Adds another clip of an already imported file to the end of the story. */
export function appendClip(project: Project, mediaId: Id, maxClipSeconds: Seconds | null = null): Project {
  const media = project.media[mediaId];
  if (media?.kind !== 'video') return project;
  return touch(project, { story: [...project.story, newClip(media, maxClipSeconds)] });
}

/** Removes a file, every clip made from it and their text, or the music if it was the music. */
export function removeMedia(project: Project, mediaId: Id): Project {
  if (!project.media[mediaId]) return project;
  const media = { ...project.media };
  delete media[mediaId];
  const story = project.story.filter((clip) => clip.mediaId !== mediaId);
  const kept = new Set(story.map((clip) => clip.id));
  return touch(project, {
    media,
    story,
    texts: project.texts.filter((item) => kept.has(item.clipId)),
    music: project.music?.mediaId === mediaId ? null : project.music,
  });
}

/** Removes a clip and the text pinned to it. */
export function removeClip(project: Project, clipId: Id): Project {
  if (!project.story.some((clip) => clip.id === clipId)) return project;
  return touch(project, {
    story: project.story.filter((clip) => clip.id !== clipId),
    texts: project.texts.filter((item) => item.clipId !== clipId),
  });
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
  const second: StoryClip = { ...clip, id: makeId(), in: sourceTime, transitionIn: CUT };
  const story = project.story.slice();
  story.splice(index, 1, { ...clip, out: sourceTime }, second);
  // Text that starts after the cut moves to the second half, keeping its moment.
  const firstLength = sourceTime - clip.in;
  const texts = project.texts.map((item) => (item.clipId === clip.id && item.offset >= firstLength
    ? { ...item, clipId: second.id, offset: item.offset - firstLength }
    : item));
  return touch(project, { story, texts });
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

export function setTransition(project: Project, clipId: Id, transitionIn: Transition): Project {
  return updateClip(project, clipId, (clip) => ({ ...clip, transitionIn }));
}

const MIN_TEXT_SECONDS = 0.5;

/** Adds text to a clip at a moment inside it; it shows for up to 3 seconds by default. */
export function addText(project: Project, clipId: Id, offset: Seconds, text: string): Project {
  const clip = project.story.find((entry) => entry.id === clipId);
  if (!clip) return project;
  const length = clipLength(clip);
  const start = clamp(offset, 0, Math.max(0, length - MIN_TEXT_SECONDS));
  const item: TextItem = {
    id: makeId(), clipId, offset: start, duration: Math.max(MIN_TEXT_SECONDS, Math.min(3, length - start)),
    text, style: 'bold', position: 'top',
  };
  return touch(project, { texts: [...project.texts, item] });
}

export function updateText(project: Project, textId: Id, patch: Partial<Omit<TextItem, 'id' | 'clipId'>>): Project {
  const index = project.texts.findIndex((item) => item.id === textId);
  if (index < 0) return project;
  const current = project.texts[index];
  const next = { ...current, ...patch };
  next.offset = Math.max(0, next.offset);
  next.duration = Math.max(MIN_TEXT_SECONDS, next.duration);
  if ((Object.keys(next) as Array<keyof TextItem>).every((key) => next[key] === current[key])) return project;
  const texts = project.texts.slice();
  texts[index] = next;
  return touch(project, { texts });
}

export function removeText(project: Project, textId: Id): Project {
  if (!project.texts.some((item) => item.id === textId)) return project;
  return touch(project, { texts: project.texts.filter((item) => item.id !== textId) });
}

function updateVideoMedia(project: Project, mediaId: Id, update: (media: VideoMedia) => VideoMedia): Project {
  const media = project.media[mediaId];
  if (media?.kind !== 'video') return project;
  const next = update(media);
  return next === media ? project : touch(project, { media: { ...project.media, [mediaId]: next } });
}

/** Captions for one video file, in that file's own time. */
export function setMediaCaptions(project: Project, mediaId: Id, cues: SRTCue[]): Project {
  const sorted = cues.filter((cue) => cue.end > cue.start && cue.text.trim()).sort((a, b) => a.start - b.start);
  return updateVideoMedia(project, mediaId, (media) => ({ ...media, captions: sorted }));
}

export function editCaption(project: Project, mediaId: Id, cueIndex: number, text: string): Project {
  return updateCaption(project, mediaId, cueIndex, { text });
}

/** Changes one caption's text or timing (in the file's own seconds); a cue always lasts at least 0.1 s. */
export function updateCaption(project: Project, mediaId: Id, cueIndex: number, patch: Partial<SRTCue>): Project {
  return updateVideoMedia(project, mediaId, (media) => {
    const captions = media.captions ?? [];
    const cue = captions[cueIndex];
    if (!cue) return media;
    const ms = (value: number) => Math.round(value * 1000) / 1000;
    const start = ms(clamp(patch.start ?? cue.start, 0, media.duration));
    const next = { start, end: ms(Math.max(start + 0.1, patch.end ?? cue.end)), text: patch.text ?? cue.text };
    if (next.start === cue.start && next.end === cue.end && next.text === cue.text) return media;
    return { ...media, captions: captions.map((entry, index) => (index === cueIndex ? next : entry)) };
  });
}

export function removeCaption(project: Project, mediaId: Id, cueIndex: number): Project {
  return updateVideoMedia(project, mediaId, (media) => ({ ...media, captions: (media.captions ?? []).filter((_, index) => index !== cueIndex) }));
}

export function setCaptionSettings(project: Project, patch: Partial<CaptionSettings>): Project {
  const captions = { ...project.captions, ...patch };
  if (captions.enabled === project.captions.enabled && captions.style === project.captions.style) return project;
  return touch(project, { captions });
}

/** Sets (or replaces) the background music. */
export function setMusic(project: Project, media: AudioMedia): Project {
  const previous = project.music;
  const nextMedia = { ...project.media, [media.id]: media };
  if (previous && previous.mediaId !== media.id) delete nextMedia[previous.mediaId];
  return touch(project, {
    media: nextMedia,
    music: { mediaId: media.id, level: previous?.level ?? 'balanced', duckUnderClips: previous?.duckUnderClips ?? true, loop: previous?.loop ?? true },
  });
}

export function updateMusic(project: Project, patch: Partial<Omit<MusicBed, 'mediaId'>>): Project {
  if (!project.music) return project;
  const music = { ...project.music, ...patch };
  if (music.level === project.music.level && music.duckUnderClips === project.music.duckUnderClips && music.loop === project.music.loop) return project;
  return touch(project, { music });
}

export function removeMusic(project: Project): Project {
  return project.music ? removeMedia(project, project.music.mediaId) : project;
}

export function renameProject(project: Project, name: string): Project {
  const trimmed = name.slice(0, 100);
  return trimmed === project.name ? project : touch(project, { name: trimmed });
}
