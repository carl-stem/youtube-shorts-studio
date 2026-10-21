'use client';

import type { VideoFilter } from '../../../types';
import type { Id } from '../../../lib/editor/model';
import { setFraming, setLook, setMuted } from '../../../lib/editor/ops';
import { framingPreset, panPresetFraming, type Framing } from '../../../lib/render/layout';
import { LOOK_LABELS } from '../../../lib/render/drawFrame';
import { useEditor } from '../EditorProvider';
import Storyboard from '../Storyboard';
import { StepCard, primaryButton, secondaryButton } from './StepCard';

const FRAMING_CHOICES: Array<{ id: string; label: string; framing: Framing }> = [
  { id: 'center', label: 'Center', framing: panPresetFraming('center') },
  { id: 'left', label: 'Left side', framing: panPresetFraming('left') },
  { id: 'right', label: 'Right side', framing: panPresetFraming('right') },
  { id: 'fit', label: 'Whole video, blurred edges', framing: { mode: 'fit', background: 'blur' } },
];

const chip = (active: boolean) => `rounded-xl border px-3 py-2 text-xs font-semibold transition ${active ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' : 'border-[var(--border)] bg-[var(--bg-surface2)] hover:border-indigo-500/50'}`;

interface Props {
  selectedId: Id | null;
  onSelect: (clipId: Id) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function MakeItYours({ selectedId, onSelect, onBack, onNext }: Props) {
  const { project, apply } = useEditor();
  const index = project.story.findIndex((clip) => clip.id === selectedId);
  const clip = index >= 0 ? project.story[index] : null;
  const current = clip ? framingPreset(clip.framing) : null;

  const applyToAll = () => {
    if (!clip) return;
    apply((p) => p.story.reduce((next, other) => setLook(setFraming(next, other.id, clip.framing), other.id, clip.look), p), 'Apply style to all clips');
  };

  return (
    <StepCard step={3} eyebrow="Add your style" title="Make it yours" hint="Pick a clip, then choose what part of the picture to show and how it looks.">
      <Storyboard selectedId={selectedId} onSelect={onSelect} />
      {clip ? (
        <div className="mt-5 space-y-5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface2)] p-4">
          <div>
            <h3 className="text-sm font-semibold">What to show in clip {index + 1}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {FRAMING_CHOICES.map((choice) => (
                <button key={choice.id} type="button" className={chip(current === choice.id)} aria-pressed={current === choice.id} onClick={() => apply((p) => setFraming(p, clip.id, choice.framing), 'Change framing')}>{choice.label}</button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Look</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(LOOK_LABELS) as VideoFilter[]).map((look) => (
                <button key={look} type="button" className={chip(clip.look === look)} aria-pressed={clip.look === look} onClick={() => apply((p) => setLook(p, clip.id, look), 'Change look')}>{LOOK_LABELS[look]}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={clip.muted} onChange={(event) => apply((p) => setMuted(p, clip.id, event.target.checked), event.target.checked ? 'Turn sound off' : 'Turn sound on')} />
            Turn off this clip&apos;s sound
          </label>
          {project.story.length > 1 && <button type="button" className={secondaryButton} onClick={applyToAll}>Use this framing and look on every clip</button>}
        </div>
      ) : (
        <p className="mt-4 text-xs text-[var(--text-3)]">Pick a clip above to style it.</p>
      )}
      <div className="mt-5 flex items-center justify-between border-t border-indigo-500/10 pt-4">
        <button type="button" className={secondaryButton} onClick={onBack}>← Put it in order</button>
        <button type="button" className={primaryButton} onClick={onNext} disabled={!project.story.length}>Review & share →</button>
      </div>
    </StepCard>
  );
}
