// Draws one editor frame from a FrameDescription. Preview and export call the
// same function, so what people see is what they export.

import type { VideoFilter } from '../../types';
import type { Id } from '../editor/model';
import type { FrameDescription } from './compose';
import { framingRect, type Insets } from './layout';
import { drawTextBlock } from './text';

export const LOOK_FILTERS: Record<VideoFilter, string> = {
  original: 'none',
  warm: 'sepia(0.22) saturate(1.2) hue-rotate(-8deg)',
  cool: 'saturate(0.9) hue-rotate(12deg) brightness(1.04)',
  monochrome: 'grayscale(1)',
  vivid: 'saturate(1.45) contrast(1.08)',
};

export const LOOK_LABELS: Record<VideoFilter, string> = {
  original: 'Original', warm: 'Warm', cool: 'Cool', monochrome: 'Black & white', vivid: 'Vivid',
};

const BACKDROP = '#080a12';

const isReady = (video: HTMLVideoElement | null): video is HTMLVideoElement =>
  !!video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0;

/** Paints the frame; layers whose video is not ready yet are skipped. */
export function drawComposed(ctx: CanvasRenderingContext2D, frame: FrameDescription, videoFor: (clipId: Id) => HTMLVideoElement | null, safe: Insets) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, width, height);
  for (const layer of frame.layers) {
    const video = videoFor(layer.clip.id);
    if (!isReady(video) || layer.opacity <= 0) continue;
    const look = LOOK_FILTERS[layer.clip.look] ?? 'none';
    ctx.globalAlpha = layer.opacity;
    const { framing } = layer.clip;
    if (framing.mode === 'fit' && framing.background === 'blur') {
      const cover = framingRect(video.videoWidth, video.videoHeight, width, height, { mode: 'fill', zoom: 1.1, panX: 0, panY: 0 });
      ctx.filter = `${look === 'none' ? '' : `${look} `}blur(40px) brightness(0.6)`;
      ctx.drawImage(video, cover.x, cover.y, cover.width, cover.height);
    }
    const rect = framingRect(video.videoWidth, video.videoHeight, width, height, framing);
    ctx.filter = look;
    ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height);
  }
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  for (const item of frame.texts) drawTextBlock(ctx, { text: item.text, style: item.style, position: item.position, role: 'text' }, safe);
  if (frame.caption) drawTextBlock(ctx, { text: frame.caption.text, style: frame.caption.style, position: 'bottom', role: 'caption' }, safe);
  ctx.restore();
}
