'use client';

import type { VideoFilter } from '../../../types';
import type { StoryClip, Transition } from '../../../lib/editor/model';
import { CUT } from '../../../lib/editor/model';
import { setFraming, setLook, setMuted, setTransition } from '../../../lib/editor/ops';
import { framingPreset, panPresetFraming, type Framing } from '../../../lib/render/layout';
import { LOOK_LABELS } from '../../../lib/render/drawFrame';
import { useEditor } from '../EditorProvider';
import { chip, secondaryButton } from '../steps/StepCard';

const FRAMING_CHOICES: Array<{ id: string; label: string; framing: Framing }> = [
  { id: 'center', label: 'Center', framing: panPresetFraming('center') },
  { id: 'left', label: 'Left side', framing: panPresetFraming('left') },
  { id: 'right', label: 'Right side', framing: panPresetFraming('right') },
  { id: 'fit', label: 'Whole video, blurred edges', framing: { mode: 'fit', background: 'blur' } },
];

const TRANSITIONS: Array<{ id: string; label: string; transition: Transition }> = [
  { id: 'cut', label: 'Straight cut', transition: CUT },
  { id: 'fade', label: 'Fade through black', transition: { kind: 'fade', duration: 1 } },
  { id: 'dissolve', label: 'Blend from the last clip', transition: { kind: 'dissolve', duration: 1 } },
];

const fillOf = (framing: Framing) => (framing.mode === 'fill' ? framing : { mode: 'fill' as const, zoom: 1, panX: 0, panY: 0 });

export default function ClipPanel({ clip, index }: { clip: StoryClip; index: number }) {
  const { project, apply, seal } = useEditor();
  const current = framingPreset(clip.framing);

  const applyToAll = () => apply(
    (p) => p.story.reduce((next, other) => setLook(setFraming(next, other.id, clip.framing), other.id, clip.look), p),
    'Apply style to all clips',
  );

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold">What to show in clip {index + 1}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {FRAMING_CHOICES.map((choice) => (
            <button key={choice.id} type="button" className={chip(current === choice.id)} aria-pressed={current === choice.id} onClick={() => apply((p) => setFraming(p, clip.id, choice.framing), 'Change framing')}>{choice.label}</button>
          ))}
        </div>
        {clip.framing.mode === 'fill' && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--text-2)]">
            <label className="flex items-center gap-2">
              Zoom {clip.framing.zoom.toFixed(1)}×
              <input className="w-36 accent-indigo-500" type="range" min={1} max={2.5} step={0.05} value={clip.framing.zoom} aria-label="Zoom in"
                onChange={(event) => { const zoom = Number(event.target.value); apply((p) => setFraming(p, clip.id, { ...fillOf(clip.framing), zoom }), 'Zoom', `zoom:${clip.id}`); }}
                onPointerUp={seal} onKeyUp={seal} onBlur={seal} />
            </label>
            <span>Drag the preview to move the picture.</span>
            {current === 'custom' && <button type="button" className="font-semibold text-indigo-500 hover:underline" onClick={() => apply((p) => setFraming(p, clip.id, panPresetFraming('center')), 'Reset framing')}>Reset</button>}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold">Look</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(LOOK_LABELS) as VideoFilter[]).map((look) => (
            <button key={look} type="button" className={chip(clip.look === look)} aria-pressed={clip.look === look} onClick={() => apply((p) => setLook(p, clip.id, look), 'Change look')}>{LOOK_LABELS[look]}</button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold">How this clip begins</h3>
        {index === 0
          ? <p className="mt-1 text-xs text-[var(--text-3)]">This is your first clip, so it simply starts.</p>
          : (
            <div className="mt-2 flex flex-wrap gap-2">
              {TRANSITIONS.map((choice) => (
                <button key={choice.id} type="button" className={chip(clip.transitionIn.kind === choice.id)} aria-pressed={clip.transitionIn.kind === choice.id} onClick={() => apply((p) => setTransition(p, clip.id, choice.transition), 'Change transition')}>{choice.label}</button>
              ))}
            </div>
          )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={clip.muted} onChange={(event) => apply((p) => setMuted(p, clip.id, event.target.checked), event.target.checked ? 'Turn sound off' : 'Turn sound on')} />
        Turn off this clip&apos;s sound
      </label>
      {project.story.length > 1 && <button type="button" className={secondaryButton} onClick={applyToAll}>Use this framing and look on every clip</button>}
    </div>
  );
}
