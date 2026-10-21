// Output formats and framing math shared by the editor preview and export.
// Pure: no DOM, so it is unit-tested in Node.

export type AspectId = 'short' | 'landscape' | 'square';

/** Fractions (0..1) of the frame kept clear of platform UI overlays. */
export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FormatPreset {
  id: AspectId;
  label: string;
  width: number;
  height: number;
  fps: 30;
  /** Longest allowed export; null means no limit. */
  maxSeconds: number | null;
  safeArea: Insets;
}

export const FORMATS: Record<AspectId, FormatPreset> = {
  short: {
    id: 'short', label: 'Short', width: 1080, height: 1920, fps: 30, maxSeconds: 180,
    safeArea: { top: 0.10, bottom: 0.20, left: 0.06, right: 0.12 },
  },
  landscape: {
    id: 'landscape', label: 'Video', width: 1920, height: 1080, fps: 30, maxSeconds: null,
    safeArea: { top: 0.05, bottom: 0.08, left: 0.05, right: 0.05 },
  },
  square: {
    id: 'square', label: 'Square', width: 1080, height: 1080, fps: 30, maxSeconds: null,
    safeArea: { top: 0.06, bottom: 0.10, left: 0.06, right: 0.06 },
  },
};

/**
 * fill: cover the frame and crop; zoom >= 1 crops further, pan (-1..1) picks which
 * part of the overflow stays visible (pan 1 aligns the source's left/top edge).
 * fit: show the whole source; the space around it is black or a blurred copy.
 */
export type Framing =
  | { mode: 'fill'; zoom: number; panX: number; panY: number }
  | { mode: 'fit'; background: 'black' | 'blur' };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Where to draw a source of srcW×srcH inside an outW×outH frame. */
export function framingRect(srcW: number, srcH: number, outW: number, outH: number, framing: Framing): Rect {
  if (srcW <= 0 || srcH <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  if (framing.mode === 'fit') {
    const scale = Math.min(outW / srcW, outH / srcH);
    const width = srcW * scale;
    const height = srcH * scale;
    return { x: (outW - width) / 2, y: (outH - height) / 2, width, height };
  }
  const scale = Math.max(outW / srcW, outH / srcH) * Math.max(1, framing.zoom);
  const width = srcW * scale;
  const height = srcH * scale;
  const panX = clamp(framing.panX, -1, 1);
  const panY = clamp(framing.panY, -1, 1);
  return {
    x: (outW - width) / 2 + panX * (width - outW) / 2,
    y: (outH - height) / 2 + panY * (height - outH) / 2,
    width,
    height,
  };
}

/** Beginner presets for which part of wide footage stays in a tall frame. */
export type PanPreset = 'left' | 'center' | 'right';

export function panPresetFraming(preset: PanPreset): Framing {
  return { mode: 'fill', zoom: 1, panX: preset === 'left' ? 1 : preset === 'right' ? -1 : 0, panY: 0 };
}

export function framingPreset(framing: Framing): PanPreset | 'fit' | 'custom' {
  if (framing.mode === 'fit') return 'fit';
  if (framing.zoom !== 1 || framing.panY !== 0) return 'custom';
  if (framing.panX === 1) return 'left';
  if (framing.panX === -1) return 'right';
  return framing.panX === 0 ? 'center' : 'custom';
}
