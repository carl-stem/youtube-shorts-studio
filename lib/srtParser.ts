import type { SRTCue } from '../types';

export function parseSRT(text: string): SRTCue[] {
  const cues: SRTCue[] = [];
  const blocks = text.trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    const timingLine = lines.find((l) => l.includes('-->'));
    if (!timingLine) continue;
    const match = timingLine.match(
      /(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/,
    );
    if (!match) continue;
    const parseTs = (s: string): number => {
      const clean = s.replace(',', '.');
      const dotIdx = clean.lastIndexOf('.');
      const hms = clean.substring(0, dotIdx);
      const ms = clean.substring(dotIdx + 1);
      const [h, m, sec] = hms.split(':').map(Number);
      return h * 3600 + m * 60 + sec + parseInt(ms, 10) / 1000;
    };
    const textStart = lines.indexOf(timingLine) + 1;
    const textContent = lines.slice(textStart).join('\n').trim();
    if (textContent) {
      cues.push({ start: parseTs(match[1]), end: parseTs(match[2]), text: textContent });
    }
  }
  return cues;
}
