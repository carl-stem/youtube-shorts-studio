// Music level over the timeline: the chosen level, quieter under clip sound,
// with a gentle start and end. Pure; the player eases toward these values.

import type { MusicLevel, Project, Seconds } from '../editor/model';
import { duration } from '../editor/timeline';
import { frameAt } from './compose';

export const MUSIC_LEVELS: Record<MusicLevel, number> = { quiet: 0.25, balanced: 0.5, loud: 0.85 };
/** About -12 dB under clip sound. */
export const DUCK_FACTOR = 0.25;
export const MUSIC_FADE_IN: Seconds = 1;
export const MUSIC_FADE_OUT: Seconds = 1.5;

export function musicGainAt(project: Project, t: Seconds): number {
  const { music } = project;
  if (!music) return 0;
  const total = duration(project);
  if (t < 0 || t >= total) return 0;
  let gain = MUSIC_LEVELS[music.level];
  if (music.duckUnderClips) {
    const clipSound = Math.min(1, frameAt(project, t).layers.reduce((sum, layer) => sum + layer.volume, 0));
    gain *= 1 - (1 - DUCK_FACTOR) * clipSound;
  }
  return gain * Math.min(1, t / MUSIC_FADE_IN) * Math.min(1, (total - t) / MUSIC_FADE_OUT);
}

/** Where the music file should be at timeline time t, or null once a non-looping song has ended. */
export function musicTimeAt(project: Project, t: Seconds): Seconds | null {
  const { music } = project;
  const media = music ? project.media[music.mediaId] : null;
  if (!music || !media || media.duration <= 0) return null;
  if (t < media.duration) return Math.max(0, t);
  return music.loop ? t % media.duration : null;
}
