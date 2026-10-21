// Pure form logic for the YouTube publish dialog: defaults per export, the
// schedule→publishAt conversion and what still blocks publishing. Tested in Node.

import type { YouTubeDraft } from './youtubeUpload';

export const DESCRIPTION_MAX = 5000;
export const TITLE_MAX = 100;
/** YouTube treats vertical or square videos up to 3 minutes as Shorts. */
export const SHORTS_MAX_SECONDS = 180;
/** Scheduled times must leave room for the upload and processing to finish. */
export const MIN_SCHEDULE_LEAD_MINUTES = 15;

export type Privacy = YouTubeDraft['privacy'];

export interface YouTubeForm {
  title: string;
  description: string;
  tags: string;
  /** Optional "#Shorts" hashtag, offered only for Shorts-shaped videos. */
  addShortsTag: boolean;
  categoryId: string;
  /** No default: the uploader must answer. */
  madeForKids: 'yes' | 'no' | null;
  privacy: Privacy;
  /** `datetime-local` value (local wall time, no zone), or '' for no schedule. */
  scheduleAt: string;
}

export interface ExportShape {
  filename: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
}

export function isShortsCandidate(shape: ExportShape): boolean {
  const { width, height, durationSeconds } = shape;
  if (!width || !height || durationSeconds === undefined) return false;
  return height >= width && durationSeconds > 0 && durationSeconds <= SHORTS_MAX_SECONDS;
}

export function initialYouTubeForm(shape: ExportShape, defaultCategoryId: string): YouTubeForm {
  return {
    title: shape.filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ').slice(0, TITLE_MAX),
    description: '',
    tags: defaultCategoryId === '10' ? 'music' : '',
    addShortsTag: isShortsCandidate(shape),
    categoryId: defaultCategoryId,
    madeForKids: null,
    privacy: 'private',
    scheduleAt: '',
  };
}

/** Appends "#Shorts" on its own line unless the text already has it. */
export function withShortsTag(description: string, add: boolean): string {
  if (!add || /(^|\s)#shorts\b/i.test(description)) return description;
  const trimmed = description.trimEnd();
  return trimmed ? `${trimmed}\n\n#Shorts` : '#Shorts';
}

const pad = (n: number) => String(Math.abs(Math.trunc(n))).padStart(2, '0');

/**
 * Converts a `datetime-local` value to ISO 8601 with the browser's UTC offset for
 * that date (DST-aware), e.g. "2026-10-22T09:30:00+02:00". Returns null for
 * malformed or non-existent local times.
 */
export function localDateTimeToIso(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const local = new Date(year, month - 1, day, hour, minute, 0, 0);
  // Reject dates the Date constructor rolled over (Feb 30, or a skipped DST hour).
  if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day
    || local.getHours() !== hour || local.getMinutes() !== minute) return null;
  const offset = -local.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

/** `datetime-local` value for "now + lead", used as the picker's `min`. */
export function minScheduleValue(nowMs: number): string {
  const d = new Date(nowMs + MIN_SCHEDULE_LEAD_MINUTES * 60_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Scheduling forces private: YouTube only honours publishAt on private videos. */
export function effectivePrivacy(form: Pick<YouTubeForm, 'privacy' | 'scheduleAt'>): Privacy {
  return form.scheduleAt ? 'private' : form.privacy;
}

/** Plain-language reason Publish is disabled, or null when the form is ready. */
export function youTubeFormProblem(form: YouTubeForm, nowMs: number): string | null {
  if (!form.title.trim()) return 'Add a title.';
  if (form.madeForKids === null) return 'Answer whether this video is made for kids.';
  if (form.description.length > DESCRIPTION_MAX) return `Shorten the description to ${DESCRIPTION_MAX} characters.`;
  if (form.scheduleAt) {
    const iso = localDateTimeToIso(form.scheduleAt);
    if (!iso) return 'Pick a valid date and time for the schedule.';
    if (Date.parse(iso) < nowMs + MIN_SCHEDULE_LEAD_MINUTES * 60_000) {
      return `Pick a time at least ${MIN_SCHEDULE_LEAD_MINUTES} minutes from now.`;
    }
  }
  return null;
}

export function toYouTubeDraft(form: YouTubeForm): YouTubeDraft {
  return {
    title: form.title.trim().slice(0, TITLE_MAX),
    description: withShortsTag(form.description, form.addShortsTag).slice(0, DESCRIPTION_MAX),
    tags: form.tags,
    privacy: effectivePrivacy(form),
    publishAt: form.scheduleAt ? localDateTimeToIso(form.scheduleAt) : null,
    categoryId: form.categoryId,
    madeForKids: form.madeForKids === 'yes',
  };
}
