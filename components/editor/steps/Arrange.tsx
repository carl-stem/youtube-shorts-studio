'use client';

import type { Id, Seconds } from '../../../lib/editor/model';
import { MIN_CLIP_SECONDS } from '../../../lib/editor/model';
import { splitAt, trimClip } from '../../../lib/editor/ops';
import { clipLength, clipStarts, duration, formatTimecode, locate } from '../../../lib/editor/timeline';
import { useEditor } from '../EditorProvider';
import Storyboard from '../Storyboard';
import LengthNotice from '../LengthNotice';
import { StepCard, primaryButton, secondaryButton } from './StepCard';

interface Props {
  selectedId: Id | null;
  onSelect: (clipId: Id) => void;
  playhead: Seconds;
  onSeek: (t: Seconds) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function Arrange({ selectedId, onSelect, playhead, onSeek, onBack, onNext }: Props) {
  const { project, apply, seal } = useEditor();
  const index = project.story.findIndex((clip) => clip.id === selectedId);
  const clip = index >= 0 ? project.story[index] : null;
  const media = clip ? project.media[clip.mediaId] : null;
  const clipStart = index >= 0 ? clipStarts(project)[index] : 0;
  const hit = locate(project, playhead);
  const canCut = !!hit && hit.sourceTime - hit.clip.in >= MIN_CLIP_SECONDS && hit.clip.out - hit.sourceTime >= MIN_CLIP_SECONDS;

  const trim = (edge: 'in' | 'out', value: number) => {
    if (!clip) return;
    apply((p) => trimClip(p, clip.id, edge, value), 'Trim clip', `trim:${clip.id}:${edge}`);
    // Show the frame being trimmed to: the new first frame, or just before the new last one.
    const length = edge === 'in' ? clip.out - Math.min(value, clip.out - MIN_CLIP_SECONDS) : Math.max(value, clip.in + MIN_CLIP_SECONDS) - clip.in;
    onSeek(edge === 'in' ? clipStart : clipStart + Math.max(0, length - 0.05));
  };

  return (
    <StepCard step={2} eyebrow="Shape your story" title="Put it in order" hint="Drag tiles to reorder. Pick a tile to trim it, or play the preview and press Cut here.">
      <Storyboard selectedId={selectedId} onSelect={(id) => { onSelect(id); const i = project.story.findIndex((c) => c.id === id); if (i >= 0) onSeek(clipStarts(project)[i]); }} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className={secondaryButton} disabled={!canCut} onClick={() => apply((p) => splitAt(p, playhead), 'Cut clip')} title="Split the clip at the preview's current moment">✂ Cut here</button>
        <span className="text-xs text-[var(--text-2)]">at {formatTimecode(playhead)} · story length <strong className="text-[var(--text-1)]">{formatTimecode(duration(project))}</strong></span>
      </div>
      <LengthNotice />

      {clip && media && (
        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface2)] p-4">
          <h3 className="text-sm font-semibold">Trim clip {index + 1}</h3>
          <p className="truncate text-xs text-[var(--text-3)]">{media.name}</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-[var(--text-2)]">
              Starts at {formatTimecode(clip.in)} <span className="text-[var(--text-3)]">({clip.in.toFixed(1)}s)</span>
              <input className="mt-1.5 w-full accent-indigo-500" type="range" min={0} max={media.duration} step={0.05} value={clip.in}
                onChange={(event) => trim('in', Number(event.target.value))} onPointerUp={seal} onKeyUp={seal} onBlur={seal} aria-label="Clip start" />
            </label>
            <label className="block text-xs font-medium text-[var(--text-2)]">
              Ends at {formatTimecode(clip.out)} <span className="text-[var(--text-3)]">({clip.out.toFixed(1)}s)</span>
              <input className="mt-1.5 w-full accent-indigo-500" type="range" min={0} max={media.duration} step={0.05} value={clip.out}
                onChange={(event) => trim('out', Number(event.target.value))} onPointerUp={seal} onKeyUp={seal} onBlur={seal} aria-label="Clip end" />
            </label>
          </div>
          <p className="mt-2 text-xs text-[var(--text-2)]">This clip plays for <strong className="text-[var(--text-1)]">{clipLength(clip).toFixed(1)} seconds</strong>.</p>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-indigo-500/10 pt-4">
        <button type="button" className={secondaryButton} onClick={onBack}>← Add videos</button>
        <button type="button" className={primaryButton} onClick={onNext} disabled={!project.story.length}>Make it yours →</button>
      </div>
    </StepCard>
  );
}
