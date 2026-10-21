'use client';

import type { AspectId } from '../../lib/render/layout';

interface Choice {
  id: AspectId | 'visualizer';
  title: string;
  detail: string;
  shape: string;
  available: boolean;
}

const CHOICES: Choice[] = [
  { id: 'short', title: 'Short', detail: 'Vertical 9:16, up to 3 minutes', shape: 'h-14 w-8', available: true },
  { id: 'landscape', title: 'Video', detail: 'Widescreen 16:9, any length', shape: 'h-8 w-14', available: false },
  { id: 'square', title: 'Square', detail: '1:1 for feeds', shape: 'h-11 w-11', available: false },
  { id: 'visualizer', title: 'Music visualizer', detail: 'Turn a song into Shorts', shape: 'h-14 w-8', available: true },
];

interface Props {
  onPick: (format: AspectId) => void;
  onOpenVisualizer: () => void;
}

export default function StartScreen({ onPick, onOpenVisualizer }: Props) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-500">New editor · beta</p>
      <h2 className="mt-1 text-2xl font-bold tracking-tight">What are you making?</h2>
      <p className="mt-1 text-sm text-[var(--text-2)]">Pick a shape. Your videos stay on this device while you edit.</p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            disabled={!choice.available}
            onClick={() => (choice.id === 'visualizer' ? onOpenVisualizer() : onPick(choice.id))}
            className="group flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 text-left transition hover:border-indigo-500/60 hover:shadow-lg hover:shadow-indigo-900/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--border)] disabled:hover:shadow-none"
          >
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10">
              <span className={`${choice.shape} rounded-md border-2 border-indigo-400 bg-indigo-500/20`} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{choice.title}</span>
              <span className="block text-xs text-[var(--text-2)]">{choice.detail}</span>
              {!choice.available && <span className="mt-1 inline-block rounded-full bg-[var(--bg-surface2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-3)]">Coming soon</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
