// Derived timeline values. Pure functions of the project.

import type { Project, Seconds, StoryClip } from './model';

export function clipLength(clip: StoryClip): Seconds {
  return Math.max(0, clip.out - clip.in);
}

/** Timeline start time of each clip, in story order. */
export function clipStarts(project: Project): Seconds[] {
  const starts: Seconds[] = [];
  let t = 0;
  for (const clip of project.story) {
    starts.push(t);
    t += clipLength(clip);
  }
  return starts;
}

export function duration(project: Project): Seconds {
  return project.story.reduce((total, clip) => total + clipLength(clip), 0);
}

export interface Located {
  index: number;
  clip: StoryClip;
  /** Timeline time at which this clip starts. */
  clipStart: Seconds;
  /** Matching time inside the clip's media file. */
  sourceTime: Seconds;
}

/**
 * The clip showing at timeline time t. A time exactly on a cut belongs to the
 * clip that starts there; times at or past the end resolve to the last frame.
 */
export function locate(project: Project, t: Seconds): Located | null {
  const { story } = project;
  if (!story.length) return null;
  const time = Math.max(0, t);
  let clipStart = 0;
  for (let index = 0; index < story.length; index += 1) {
    const clip = story[index];
    const length = clipLength(clip);
    if (time < clipStart + length) return { index, clip, clipStart, sourceTime: clip.in + (time - clipStart) };
    clipStart += length;
  }
  const index = story.length - 1;
  const clip = story[index];
  return { index, clip, clipStart: clipStart - clipLength(clip), sourceTime: clip.out };
}

/** m:ss, or h:mm:ss from one hour. */
export function formatTimecode(seconds: Seconds): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
