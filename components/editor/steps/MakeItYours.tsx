'use client';

import { useState } from 'react';
import type { Id, Seconds } from '../../../lib/editor/model';
import { clipStarts } from '../../../lib/editor/timeline';
import { useEditor } from '../EditorProvider';
import Storyboard from '../Storyboard';
import CaptionsPanel from '../panels/CaptionsPanel';
import ClipPanel from '../panels/ClipPanel';
import MusicPanel from '../panels/MusicPanel';
import TextPanel from '../panels/TextPanel';
import { StepCard, primaryButton, secondaryButton } from './StepCard';

type Tab = 'clip' | 'text' | 'captions' | 'music';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'clip', label: 'Picture & transition' },
  { id: 'text', label: 'Text' },
  { id: 'captions', label: 'Captions' },
  { id: 'music', label: 'Music' },
];

interface Props {
  selectedId: Id | null;
  onSelect: (clipId: Id) => void;
  playhead: Seconds;
  onSeek: (t: Seconds) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function MakeItYours({ selectedId, onSelect, playhead, onSeek, onBack, onNext }: Props) {
  const { project } = useEditor();
  const [tab, setTab] = useState<Tab>('clip');
  const index = project.story.findIndex((clip) => clip.id === selectedId);
  const clip = index >= 0 ? project.story[index] : null;
  const clipStart = index >= 0 ? clipStarts(project)[index] : 0;
  const select = (id: Id) => {
    onSelect(id);
    const i = project.story.findIndex((entry) => entry.id === id);
    if (i >= 0) onSeek(clipStarts(project)[i] + 0.05);
  };

  return (
    <StepCard step={3} eyebrow="Add your style" title="Make it yours" hint="Pick a clip, then choose how it looks, add text or captions, and set the music for the whole video.">
      <Storyboard selectedId={selectedId} onSelect={select} />
      <div role="tablist" aria-label="Style options" className="mt-5 flex flex-wrap gap-1 rounded-xl bg-[var(--bg-surface2)] p-1">
        {TABS.map((entry) => (
          <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} onClick={() => setTab(entry.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === entry.id ? 'bg-[var(--bg-surface)] text-indigo-600 shadow dark:text-indigo-300' : 'text-[var(--text-2)] hover:text-[var(--text-1)]'}`}>
            {entry.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface2)] p-4">
        {tab === 'music' && <MusicPanel />}
        {tab !== 'music' && !clip && <p className="text-xs text-[var(--text-3)]">Pick a clip above.</p>}
        {tab === 'clip' && clip && <ClipPanel clip={clip} index={index} />}
        {tab === 'text' && clip && <TextPanel clip={clip} index={index} clipStart={clipStart} playhead={playhead} onSeek={onSeek} />}
        {tab === 'captions' && clip && <CaptionsPanel clip={clip} clipStart={clipStart} onSeek={onSeek} />}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-indigo-500/10 pt-4">
        <button type="button" className={secondaryButton} onClick={onBack}>← Put it in order</button>
        <button type="button" className={primaryButton} onClick={onNext} disabled={!project.story.length}>Review & share →</button>
      </div>
    </StepCard>
  );
}
