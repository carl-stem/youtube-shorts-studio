// Derived timeline values. Pure functions of the project.

import type { Project, Seconds, StoryClip } from './model';

export function clipLength(clip: StoryClip): Seconds {
  return Math.max(0, clip.out - clip.in);
}

/**
 * Seconds clip `index` overlaps the clip before it. Only dissolves overlap, and
 * never by more than half of either clip, so every clip keeps a moment of its own.
 */
export function overlapBefore(project: Project, index: number): Seconds {
  const clip = project.story[index];
  const previous = project.story[index - 1];
  if (!clip || !previous || clip.transitionIn.kind !== 'dissolve') return 0;
  return Math.min(clip.transitionIn.duration, clipLength(clip) / 2, clipLength(previous) / 2);
}

/** Half-length of a fade at the start of clip `index` (fade out, then fade in). */
export function fadeHalfBefore(project: Project, index: number): Seconds {
  const clip = project.story[index];
  const previous = project.story[index - 1];
  if (!clip || !previous || clip.transitionIn.kind !== 'fade') return 0;
  return Math.min(clip.transitionIn.duration / 2, clipLength(clip) / 2, clipLength(previous) / 2);
}

/** Timeline start time of each clip, in story order. */
export function clipStarts(project: Project): Seconds[] {
  const starts: Seconds[] = [];
  let t = 0;
  project.story.forEach((clip, index) => {
    if (index > 0) t -= overlapBefore(project, index);
    starts.push(t);
    t += clipLength(clip);
  });
  return starts;
}

export function duration(project: Project): Seconds {
  const { story } = project;
  if (!story.length) return 0;
  return clipStarts(project)[story.length - 1] + clipLength(story[story.length - 1]);
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
 * The clip in charge at timeline time t: the latest one that has started. During
 * a dissolve that is the incoming clip. A time exactly on a cut belongs to the
 * clip that starts there; times at or past the end resolve to the last frame.
 */
export function locate(project: Project, t: Seconds): Located | null {
  const { story } = project;
  if (!story.length) return null;
  const starts = clipStarts(project);
  const end = starts[story.length - 1] + clipLength(story[story.length - 1]);
  if (t >= end) {
    const index = story.length - 1;
    return { index, clip: story[index], clipStart: starts[index], sourceTime: story[index].out };
  }
  const time = Math.max(0, t);
  let index = 0;
  while (index + 1 < story.length && starts[index + 1] <= time) index += 1;
  return { index, clip: story[index], clipStart: starts[index], sourceTime: story[index].in + (time - starts[index]) };
}

/** m:ss, or h:mm:ss from one hour. */
export function formatTimecode(seconds: Seconds): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
