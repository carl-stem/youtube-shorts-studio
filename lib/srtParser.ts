import type { SRTCue } from '../types';
import { parseCaptionFile } from './media/captions';

/** SRT or WebVTT text to cues; kept under this name for the audio workflow. */
export function parseSRT(text: string): SRTCue[] {
  return parseCaptionFile(text);
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
