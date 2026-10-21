// Text and caption drawing. Sizes are fractions of the frame so every format
// gets the same look; positions stay inside the format's safe area.

import type { TextPosition, TextStyleId } from '../editor/model';
import type { Insets } from './layout';

/** Greedy word wrap; measure returns a string's width in pixels. */
export function wrapText(measure: (text: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate) > maxWidth) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
  }
  return lines;
}

const WEIGHT: Record<TextStyleId, number> = { bold: 800, boxed: 700, clean: 600 };

export interface TextBlock {
  text: string;
  style: TextStyleId;
  /** Captions sit at the bottom of the safe area; text 'bottom' sits above them. */
  role: 'text' | 'caption';
  position: TextPosition;
}

export function drawTextBlock(ctx: CanvasRenderingContext2D, block: TextBlock, safe: Insets) {
  const { width, height } = ctx.canvas;
  const base = Math.min(width, height);
  const size = Math.round(base * (block.role === 'caption' ? 0.045 : 0.062));
  const lineHeight = Math.round(size * 1.25);
  const left = safe.left * width;
  const usable = width - left - safe.right * width;
  ctx.save();
  ctx.font = `${WEIGHT[block.style]} ${size}px Inter, Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapText((value) => ctx.measureText(value).width, block.text, usable - size).slice(0, 4);
  if (!lines.length) { ctx.restore(); return; }
  const blockHeight = lines.length * lineHeight;
  const top = safe.top * height;
  const bottom = height - safe.bottom * height;
  let y: number;
  if (block.role === 'caption') y = bottom - blockHeight - size * 0.5;
  else if (block.position === 'top') y = top + size * 0.5;
  else if (block.position === 'middle') y = (height - blockHeight) / 2;
  else y = bottom - blockHeight - height * 0.14;
  const centerX = left + usable / 2;

  if (block.style === 'boxed') {
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const padX = size * 0.6;
    const padY = size * 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.beginPath();
    ctx.roundRect(centerX - widest / 2 - padX, y - padY, widest + padX * 2, blockHeight + padY * 2, size * 0.35);
    ctx.fill();
  }
  lines.forEach((line, index) => {
    const lineY = y + index * lineHeight + lineHeight / 2;
    if (block.style === 'bold') {
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(line, centerX, lineY);
    }
    if (block.style === 'clean') {
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = size * 0.3;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, centerX, lineY);
  });
  ctx.restore();
}
