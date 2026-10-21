'use client';

import type { Seconds, StoryClip, TextPosition, TextStyleId } from '../../../lib/editor/model';
import { addText, removeText, updateText } from '../../../lib/editor/ops';
import { clipLength, formatTimecode } from '../../../lib/editor/timeline';
import { useEditor } from '../EditorProvider';
import { chip, inputClass, secondaryButton } from '../steps/StepCard';

export const STYLE_LABELS: Record<TextStyleId, string> = { bold: 'Bold outline', boxed: 'Dark box', clean: 'Soft shadow' };
const POSITION_LABELS: Record<TextPosition, string> = { top: 'Top', middle: 'Middle', bottom: 'Bottom' };
const LENGTHS = [2, 3, 5];

interface Props {
  clip: StoryClip;
  index: number;
  clipStart: Seconds;
  playhead: Seconds;
  onSeek: (t: Seconds) => void;
}

export default function TextPanel({ clip, index, clipStart, playhead, onSeek }: Props) {
  const { project, apply, seal } = useEditor();
  const items = project.texts.filter((item) => item.clipId === clip.id);
  const length = clipLength(clip);
  const inside = playhead >= clipStart && playhead < clipStart + length;

  const add = () => {
    const offset = inside ? playhead - clipStart : 0;
    apply((p) => addText(p, clip.id, offset, 'Your text'), 'Add text');
    onSeek(clipStart + offset + 0.05);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={secondaryButton} onClick={add}>+ Add text to clip {index + 1}</button>
        <span className="text-xs text-[var(--text-3)]">{inside ? `Starts at ${formatTimecode(playhead)} (where the preview is)` : 'Starts when the clip starts'}</span>
      </div>
      {items.length === 0 && <p className="text-xs text-[var(--text-3)]">No text on this clip yet. Titles, names and calls to action work well here.</p>}
      {items.map((item) => (
        <div key={item.id} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
          <div className="flex gap-2">
            <input className={inputClass} value={item.text} maxLength={120} aria-label="Text on video"
              onChange={(event) => apply((p) => updateText(p, item.id, { text: event.target.value }), 'Edit text', `text:${item.id}`)} onBlur={seal}
              onFocus={() => onSeek(clipStart + item.offset + 0.05)} />
            <button type="button" className="shrink-0 rounded-lg px-3 text-xs text-rose-400 hover:bg-rose-500/10" onClick={() => apply((p) => removeText(p, item.id), 'Delete text')}>Delete</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STYLE_LABELS) as TextStyleId[]).map((style) => (
              <button key={style} type="button" className={chip(item.style === style)} aria-pressed={item.style === style} onClick={() => apply((p) => updateText(p, item.id, { style }), 'Change text style')}>{STYLE_LABELS[style]}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(POSITION_LABELS) as TextPosition[]).map((position) => (
              <button key={position} type="button" className={chip(item.position === position)} aria-pressed={item.position === position} onClick={() => apply((p) => updateText(p, item.id, { position }), 'Move text')}>{POSITION_LABELS[position]}</button>
            ))}
            <span className="mx-1 self-center text-xs text-[var(--text-3)]">Shows for</span>
            {LENGTHS.map((seconds) => (
              <button key={seconds} type="button" className={chip(item.duration === seconds)} aria-pressed={item.duration === seconds} onClick={() => apply((p) => updateText(p, item.id, { duration: seconds }), 'Change text length')}>{seconds}s</button>
            ))}
            <button type="button" className={chip(item.offset === 0 && item.duration >= length)} onClick={() => apply((p) => updateText(p, item.id, { offset: 0, duration: length }), 'Change text length')}>Whole clip</button>
          </div>
        </div>
      ))}
    </div>
  );
}
