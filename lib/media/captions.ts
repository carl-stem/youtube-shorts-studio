// The one SRT / WebVTT parser for every workflow.

import type { SRTCue } from '../../types';

export function parseCaptionFile(text: string): SRTCue[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  const blocks = normalized.replace(/^WEBVTT[^\n]*\n/, '').split(/\n\s*\n/);
  const cues: SRTCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const timingLine = lines.find((line) => line.includes('-->'));
    if (!timingLine) continue;
    const match = timingLine.match(/(?:(\d{2,}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{2,}):)?(\d{2}):(\d{2})[,.](\d{3})/);
    if (!match) continue;
    const toSeconds = (h: string | undefined, m: string, s: string, ms: string) =>
      (Number(h || 0) * 3600) + Number(m) * 60 + Number(s) + Number(ms) / 1000;
    const start = toSeconds(match[1], match[2], match[3], match[4]);
    const end = toSeconds(match[5], match[6], match[7], match[8]);
    const index = lines.indexOf(timingLine);
    const cueText = lines.slice(index + 1).join('\n').replace(/<[^>]*>/g, '').trim();
    if (cueText && end > start) cues.push({ start, end, text: cueText });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** Parses captions and counts timed entries that could not be read, so people can be told. */
export function parseCaptionReport(text: string): { cues: SRTCue[]; unreadable: number } {
  const cues = parseCaptionFile(text);
  const timed = text.replace(/\r/g, '').split(/\n\s*\n/).filter((block) => block.includes('-->')).length;
  return { cues, unreadable: Math.max(0, timed - cues.length) };
}
