'use client';

import { useRef } from 'react';
import type { Seconds, StoryClip, TextStyleId } from '../../../lib/editor/model';
import { removeCaption, setCaptionSettings, setMediaCaptions, updateCaption } from '../../../lib/editor/ops';
import { formatTimecode } from '../../../lib/editor/timeline';
import { parseCaptionReport } from '../../../lib/media/captions';
import { useEditor } from '../EditorProvider';
import { chip, inputClass, secondaryButton } from '../steps/StepCard';
import { STYLE_LABELS } from './TextPanel';

interface Props {
  clip: StoryClip;
  clipStart: Seconds;
  onSeek: (t: Seconds) => void;
}

/** Captions belong to the video file, so one file's captions serve every clip cut from it. */
export default function CaptionsPanel({ clip, clipStart, onSeek }: Props) {
  const { project, apply, seal, notify } = useEditor();
  const pickerRef = useRef<HTMLInputElement>(null);
  const media = project.media[clip.mediaId];
  if (media?.kind !== 'video') return null;
  const cues = (media.captions ?? []).map((cue, cueIndex) => ({ cue, cueIndex })).filter(({ cue }) => cue.end > clip.in && cue.start < clip.out);

  const importFile = async (file: File) => {
    const { cues: parsed, unreadable } = parseCaptionReport(await file.text());
    if (!parsed.length) { notify('No captions were found in that file. Choose an SRT or VTT file.', 'error'); return; }
    apply((p) => setMediaCaptions(p, media.id, parsed), 'Add captions');
    notify(`${parsed.length} caption${parsed.length === 1 ? '' : 's'} added to ${media.name}.`, 'success');
    if (unreadable) notify(`${unreadable} entr${unreadable === 1 ? 'y' : 'ies'} in ${file.name} could not be read and ${unreadable === 1 ? 'was' : 'were'} skipped.`, 'info');
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={project.captions.enabled} onChange={(event) => apply((p) => setCaptionSettings(p, { enabled: event.target.checked }), event.target.checked ? 'Show captions' : 'Hide captions')} />
        Show captions on my video
      </label>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STYLE_LABELS) as TextStyleId[]).map((style) => (
          <button key={style} type="button" className={chip(project.captions.style === style)} aria-pressed={project.captions.style === style} onClick={() => apply((p) => setCaptionSettings(p, { style }), 'Change caption style')}>{STYLE_LABELS[style]}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={secondaryButton} onClick={() => pickerRef.current?.click()}>{media.captions?.length ? 'Replace captions file' : 'Add a captions file (SRT or VTT)'}</button>
        <input ref={pickerRef} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" className="hidden"
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file); }} />
        <span className="truncate text-xs text-[var(--text-3)]">for {media.name}</span>
      </div>
      {cues.length > 0 ? (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {cues.map(({ cue, cueIndex }) => (
            <li key={cueIndex} className="space-y-1.5 rounded-xl bg-[var(--bg-surface)] p-2">
              <div className="flex items-center gap-2">
                <button type="button" className="mono shrink-0 rounded-lg px-2 py-1 text-[11px] text-indigo-400 hover:bg-indigo-500/10" onClick={() => onSeek(clipStart + Math.max(0, cue.start - clip.in) + 0.05)} title="Show this moment">{formatTimecode(Math.max(0, cue.start - clip.in))}</button>
                <input className={inputClass} value={cue.text} aria-label={`Caption at ${formatTimecode(cue.start)}`}
                  onChange={(event) => apply((p) => updateCaption(p, media.id, cueIndex, { text: event.target.value }), 'Edit caption', `caption:${media.id}:${cueIndex}`)} onBlur={seal} />
                <button type="button" className="shrink-0 rounded-lg px-2 py-2 text-xs text-rose-400 hover:bg-rose-500/10" aria-label="Delete caption" onClick={() => apply((p) => removeCaption(p, media.id, cueIndex), 'Delete caption')}>×</button>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-1 text-[11px] text-[var(--text-3)]">
                <span>Shows from</span>
                <input className="w-20 rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-[11px]" type="number" step={0.1} min={0} value={cue.start} aria-label="Caption start, seconds in the video file"
                  onChange={(event) => apply((p) => updateCaption(p, media.id, cueIndex, { start: Number(event.target.value) }), 'Change caption timing', `caption-time:${media.id}:${cueIndex}`)} onBlur={seal} />
                <span>to</span>
                <input className="w-20 rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-[11px]" type="number" step={0.1} min={0} value={cue.end} aria-label="Caption end, seconds in the video file"
                  onChange={(event) => apply((p) => updateCaption(p, media.id, cueIndex, { end: Number(event.target.value) }), 'Change caption timing', `caption-time:${media.id}:${cueIndex}`)} onBlur={seal} />
                <span>seconds into {media.name}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--text-3)]">{media.captions?.length ? 'None of this file’s captions fall inside this clip.' : 'No captions for this video yet. Captions stay matched to what is said even after you trim or cut.'}</p>
      )}
    </div>
  );
}
