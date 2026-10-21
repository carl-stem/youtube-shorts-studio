// Editor project model. The storyline is a gap-free ordered list of clips, so a
// clip's position on the timeline is derived (see timeline.ts), never stored:
// reorder, trim and delete cannot leave gaps or overlaps.
//
// Captions belong to the video file and use its own timestamps, so they stay in
// sync through any trim, cut or reorder. Text is pinned to a clip and moves with
// it. Music is the only thing placed on the timeline itself.

import type { SRTCue, VideoFilter } from '../../types';
import type { AspectId, Framing } from '../render/layout';

export const SCHEMA_VERSION = 1;
/** Shortest clip the editor allows, so every clip stays visible and grabbable. */
export const MIN_CLIP_SECONDS = 0.25;

export type Id = string;
export type Seconds = number;

interface MediaBase {
  id: Id;
  name: string;
  size: number;
  lastModified: number;
  duration: Seconds;
}

/** Persistable description of an imported file; the File itself lives outside the project. */
export interface VideoMedia extends MediaBase {
  kind: 'video';
  width: number;
  height: number;
  /** Caption cues in this file's own time. */
  captions?: SRTCue[];
}

export interface AudioMedia extends MediaBase {
  kind: 'audio';
}

export type MediaRef = VideoMedia | AudioMedia;

/** How a clip begins. A dissolve overlaps the previous clip; a fade dips through black. */
export type Transition =
  | { kind: 'cut' }
  | { kind: 'fade' | 'dissolve'; duration: 0.5 | 1 };

export interface StoryClip {
  id: Id;
  mediaId: Id;
  /** Source range, in seconds of the media file. */
  in: Seconds;
  out: Seconds;
  framing: Framing;
  look: VideoFilter;
  muted: boolean;
  /** Ignored on the first clip. */
  transitionIn: Transition;
}

export type TextStyleId = 'bold' | 'boxed' | 'clean';
export type TextPosition = 'top' | 'middle' | 'bottom';

export interface TextItem {
  id: Id;
  clipId: Id;
  /** Seconds after the clip starts. */
  offset: Seconds;
  duration: Seconds;
  text: string;
  style: TextStyleId;
  position: TextPosition;
}

export interface CaptionSettings {
  enabled: boolean;
  style: TextStyleId;
}

export type MusicLevel = 'quiet' | 'balanced' | 'loud';

export interface MusicBed {
  mediaId: Id;
  level: MusicLevel;
  /** Music gets quieter while a clip's own sound is playing. */
  duckUnderClips: boolean;
  loop: boolean;
}

export interface Project {
  _type: 'shorts-studio-editor';
  schemaVersion: typeof SCHEMA_VERSION;
  id: Id;
  name: string;
  createdAt: string;
  updatedAt: string;
  format: AspectId;
  media: Record<Id, MediaRef>;
  story: StoryClip[];
  texts: TextItem[];
  captions: CaptionSettings;
  music: MusicBed | null;
}

export const CUT: Transition = { kind: 'cut' };

export function makeId(): Id {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createProject(format: AspectId, now: Date = new Date()): Project {
  const stamp = now.toISOString();
  return {
    _type: 'shorts-studio-editor',
    schemaVersion: SCHEMA_VERSION,
    id: makeId(),
    name: 'Untitled project',
    createdAt: stamp,
    updatedAt: stamp,
    format,
    media: {},
    story: [],
    texts: [],
    captions: { enabled: true, style: 'boxed' },
    music: null,
  };
}
