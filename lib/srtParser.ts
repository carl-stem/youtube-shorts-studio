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

function formatSrtTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// Serializes timed segments (e.g. Whisper verbose_json segments) to the same SRT text
// Whisper's `srt` response format returns, so parseSRT consumers are unaffected.
export function formatSRT(segments: ReadonlyArray<{ start: number; end: number; text: string }>): string {
  return segments
    .map((seg) => ({ ...seg, text: seg.text.trim() }))
    .filter((seg) => seg.text.length > 0)
    .map((seg, i) => `${i + 1}\n${formatSrtTimestamp(seg.start)} --> ${formatSrtTimestamp(seg.end)}\n${seg.text}\n`)
    .join('\n');
}
