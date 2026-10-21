// What should be on screen and heard at a timeline time. Pure, so preview,
// export and tests all agree on transitions, text and captions.

import type { Id, Project, Seconds, StoryClip, TextPosition, TextStyleId } from '../editor/model';
import { clipLength, clipStarts, fadeHalfBefore, locate, overlapBefore } from '../editor/timeline';

export interface Layer {
  clip: StoryClip;
  index: number;
  sourceTime: Seconds;
  /** 0..1 over black. */
  opacity: number;
  /** 0..1 share of this clip's own sound (0 when muted). */
  volume: number;
}

export interface TextOverlay {
  id: Id;
  text: string;
  style: TextStyleId;
  position: TextPosition;
}

export interface FrameDescription {
  /** Bottom to top. */
  layers: Layer[];
  texts: TextOverlay[];
  caption: { text: string; style: TextStyleId } | null;
}

const EMPTY: FrameDescription = { layers: [], texts: [], caption: null };

function captionAt(project: Project, clip: StoryClip, sourceTime: Seconds): string | null {
  const media = project.media[clip.mediaId];
  if (media?.kind !== 'video' || !media.captions) return null;
  if (sourceTime < clip.in || sourceTime >= clip.out) return null;
  const cue = media.captions.find((entry) => sourceTime >= entry.start && sourceTime < entry.end);
  return cue ? cue.text.replace(/\s+/g, ' ').trim() || null : null;
}

export function frameAt(project: Project, t: Seconds): FrameDescription {
  const hit = locate(project, t);
  if (!hit) return EMPTY;
  const { story } = project;
  const starts = clipStarts(project);
  const into = Math.max(0, t - hit.clipStart);
  const left = clipLength(hit.clip) - into;
  const sound = (clip: StoryClip, share: number) => (clip.muted ? 0 : share);

  let opacity = 1;
  const fadeIn = fadeHalfBefore(project, hit.index);
  if (fadeIn > 0 && into < fadeIn) opacity = into / fadeIn;
  const fadeOut = fadeHalfBefore(project, hit.index + 1);
  if (fadeOut > 0 && left < fadeOut) opacity = Math.min(opacity, Math.max(0, left) / fadeOut);

  const layers: Layer[] = [];
  const overlap = overlapBefore(project, hit.index);
  if (overlap > 0 && into < overlap) {
    const previous = story[hit.index - 1];
    const progress = into / overlap;
    layers.push({ clip: previous, index: hit.index - 1, sourceTime: previous.in + (t - starts[hit.index - 1]), opacity: 1, volume: sound(previous, 1 - progress) });
    layers.push({ clip: hit.clip, index: hit.index, sourceTime: hit.sourceTime, opacity: progress, volume: sound(hit.clip, progress) });
  } else {
    layers.push({ clip: hit.clip, index: hit.index, sourceTime: hit.sourceTime, opacity, volume: sound(hit.clip, opacity) });
  }

  const startOf = new Map(story.map((clip, index) => [clip.id, { start: starts[index], length: clipLength(clip) }]));
  const texts: TextOverlay[] = [];
  for (const item of project.texts) {
    const placed = startOf.get(item.clipId);
    if (!placed || !item.text.trim()) continue;
    const from = placed.start + item.offset;
    const to = placed.start + Math.min(item.offset + item.duration, placed.length);
    if (t >= from && t < to) texts.push({ id: item.id, text: item.text.trim(), style: item.style, position: item.position });
  }

  let caption: FrameDescription['caption'] = null;
  if (project.captions.enabled) {
    for (const layer of [...layers].reverse()) {
      const text = captionAt(project, layer.clip, layer.sourceTime);
      if (text) { caption = { text, style: project.captions.style }; break; }
    }
  }
  return { layers, texts, caption };
}
