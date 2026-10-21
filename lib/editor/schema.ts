// Saved-project format: a versioned JSON envelope. Loading validates every field
// so a damaged or foreign file is rejected instead of half-loading, and older
// versions are upgraded by MIGRATIONS before validation.

import type { SRTCue, VideoFilter } from '../../types';
import type { AspectId, Framing } from '../render/layout';
import {
  CUT, SCHEMA_VERSION,
  type CaptionSettings, type MediaRef, type MusicBed, type MusicLevel, type Project, type StoryClip,
  type TextItem, type TextPosition, type TextStyleId, type Transition,
} from './model';

export const PROJECT_FILE_EXTENSION = '.shortsproject.json';

export type ParseResult = { ok: true; project: Project } | { ok: false; error: string };

type Json = Record<string, unknown>;
/** Upgrades a project saved with version N to N+1. None yet: version 1 is the first saved format. */
const MIGRATIONS: Record<number, (input: Json) => Json> = {};

class Invalid extends Error {}

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const fail = (message: string): never => { throw new Invalid(message); };
const str = (value: unknown, what: string) => (typeof value === 'string' ? value : fail(`${what} is missing.`));
const num = (value: unknown, what: string) => (typeof value === 'number' && Number.isFinite(value) ? value : fail(`${what} is not a number.`));
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  (typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallback);

const FORMATS_IDS = ['short', 'landscape', 'square'] as const;
const LOOKS: readonly VideoFilter[] = ['original', 'warm', 'cool', 'monochrome', 'vivid'];
const STYLES: readonly TextStyleId[] = ['bold', 'boxed', 'clean'];
const POSITIONS: readonly TextPosition[] = ['top', 'middle', 'bottom'];
const LEVELS: readonly MusicLevel[] = ['quiet', 'balanced', 'loud'];

function cues(value: unknown): SRTCue[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isObject).flatMap((cue) => (
    typeof cue.start === 'number' && typeof cue.end === 'number' && typeof cue.text === 'string' && cue.end > cue.start
      ? [{ start: cue.start, end: cue.end, text: cue.text }] : []));
}

function media(value: unknown): MediaRef {
  if (!isObject(value)) fail('A file entry is damaged.');
  const item = value as Json;
  const base = { id: str(item.id, 'A file id'), name: str(item.name, 'A file name'), size: num(item.size, 'A file size'), lastModified: num(item.lastModified, 'A file date'), duration: num(item.duration, 'A file length') };
  if (item.kind === 'audio') return { ...base, kind: 'audio' };
  if (item.kind !== 'video') fail(`${base.name} has an unknown type.`);
  return { ...base, kind: 'video', width: num(item.width, 'A video width'), height: num(item.height, 'A video height'), captions: cues(item.captions) };
}

function framing(value: unknown): Framing {
  if (isObject(value) && value.mode === 'fit') return { mode: 'fit', background: value.background === 'black' ? 'black' : 'blur' };
  const f = isObject(value) ? value : {};
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return { mode: 'fill', zoom: Math.max(1, n(f.zoom, 1)), panX: n(f.panX, 0), panY: n(f.panY, 0) };
}

function transition(value: unknown): Transition {
  if (!isObject(value) || (value.kind !== 'fade' && value.kind !== 'dissolve')) return CUT;
  return { kind: value.kind, duration: value.duration === 0.5 ? 0.5 : 1 };
}

function clip(value: unknown, mediaById: Record<string, MediaRef>): StoryClip {
  if (!isObject(value)) fail('A clip is damaged.');
  const c = value as Json;
  const mediaId = str(c.mediaId, 'A clip’s file');
  const source = mediaById[mediaId];
  if (source?.kind !== 'video') fail('A clip points to a video that is not in the project.');
  const inPoint = num(c.in, 'A clip start');
  const outPoint = num(c.out, 'A clip end');
  if (inPoint < 0 || outPoint <= inPoint) fail('A clip has an impossible start and end.');
  return {
    id: str(c.id, 'A clip id'), mediaId, in: inPoint, out: outPoint, framing: framing(c.framing),
    look: oneOf(c.look, LOOKS, 'original'), muted: c.muted === true, transitionIn: transition(c.transitionIn),
  };
}

function text(value: unknown, clipIds: Set<string>): TextItem[] {
  if (!isObject(value) || typeof value.clipId !== 'string' || !clipIds.has(value.clipId) || typeof value.text !== 'string') return [];
  return [{
    id: str(value.id, 'A text id'), clipId: value.clipId, text: value.text,
    offset: Math.max(0, num(value.offset, 'A text start')), duration: Math.max(0.5, num(value.duration, 'A text length')),
    style: oneOf(value.style, STYLES, 'bold'), position: oneOf(value.position, POSITIONS, 'top'),
  }];
}

function validate(input: Json): Project {
  const mediaList = isObject(input.media) ? Object.values(input.media).map(media) : fail('The project has no file list.');
  const mediaById = Object.fromEntries(mediaList.map((item) => [item.id, item]));
  const story = Array.isArray(input.story) ? input.story.map((entry) => clip(entry, mediaById)) : fail('The project has no clips list.');
  const clipIds = new Set(story.map((entry) => entry.id));
  const captionsInput = isObject(input.captions) ? input.captions : {};
  const captions: CaptionSettings = { enabled: captionsInput.enabled !== false, style: oneOf(captionsInput.style, STYLES, 'boxed') };
  let music: MusicBed | null = null;
  if (isObject(input.music) && typeof input.music.mediaId === 'string' && mediaById[input.music.mediaId]?.kind === 'audio') {
    music = { mediaId: input.music.mediaId, level: oneOf(input.music.level, LEVELS, 'balanced'), duckUnderClips: input.music.duckUnderClips !== false, loop: input.music.loop !== false };
  }
  return {
    _type: 'shorts-studio-editor', schemaVersion: SCHEMA_VERSION,
    id: str(input.id, 'The project id'), name: typeof input.name === 'string' && input.name.trim() ? input.name.slice(0, 100) : 'Untitled project',
    createdAt: str(input.createdAt, 'The creation date'), updatedAt: str(input.updatedAt, 'The last saved date'),
    format: oneOf<AspectId>(input.format, FORMATS_IDS, 'short'),
    media: mediaById, story, texts: (Array.isArray(input.texts) ? input.texts : []).flatMap((entry) => text(entry, clipIds)), captions, music,
  };
}

/** Reads a saved project (parsed JSON or text). Never throws. */
export function parseProject(input: unknown): ParseResult {
  try {
    let data: unknown = input;
    if (typeof input === 'string') {
      try { data = JSON.parse(input); } catch { return { ok: false, error: 'This file is not a Shorts Studio project.' }; }
    }
    if (!isObject(data) || data._type !== 'shorts-studio-editor') return { ok: false, error: 'This file is not a Shorts Studio project.' };
    let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
    if (version > SCHEMA_VERSION) return { ok: false, error: 'This project was made with a newer version of Shorts Studio.' };
    let current: Json = data;
    while (version < SCHEMA_VERSION) {
      const migrate = MIGRATIONS[version];
      if (!migrate) return { ok: false, error: 'This project is too old to open.' };
      current = migrate(current);
      version += 1;
    }
    return { ok: true, project: validate(current) };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: `This project file is damaged: ${error.message}` };
    throw error;
  }
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}
