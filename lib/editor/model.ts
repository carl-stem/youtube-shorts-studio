// Editor project model. The storyline is a gap-free ordered list of clips, so a
// clip's position on the timeline is derived (see timeline.ts), never stored:
// reorder, trim and delete cannot leave gaps or overlaps.

import type { VideoFilter } from '../../types';
import type { AspectId, Framing } from '../render/layout';

export const SCHEMA_VERSION = 1;
/** Shortest clip the editor allows, so every clip stays visible and grabbable. */
export const MIN_CLIP_SECONDS = 0.25;

export type Id = string;
export type Seconds = number;

/** Persistable description of an imported file; the File itself lives outside the project. */
export interface MediaRef {
  id: Id;
  kind: 'video';
  name: string;
  size: number;
  lastModified: number;
  duration: Seconds;
  width: number;
  height: number;
}

export interface StoryClip {
  id: Id;
  mediaId: Id;
  /** Source range, in seconds of the media file. */
  in: Seconds;
  out: Seconds;
  framing: Framing;
  look: VideoFilter;
  muted: boolean;
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
}

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
  };
}
