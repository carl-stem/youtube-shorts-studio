'use client';

export const EDITOR_STEPS = [
  { number: 1, title: 'Add your videos', short: 'Add' },
  { number: 2, title: 'Put it in order', short: 'Order' },
  { number: 3, title: 'Make it yours', short: 'Style' },
  { number: 4, title: 'Review & share', short: 'Share' },
] as const;

interface Props {
  current: number;
  furthest: number;
  onChange: (step: number) => void;
}

export default function EditorSteps({ current, furthest, onChange }: Props) {
  return (
    <nav aria-label="Editing steps">
      <ol className="flex items-start">
        {EDITOR_STEPS.map((step, index) => {
          const active = current === step.number;
          const complete = step.number < current;
          const available = step.number <= furthest;
          return (
            <li key={step.number} className="flex min-w-0 flex-1 items-start">
              <button type="button" onClick={() => onChange(step.number)} disabled={!available} aria-current={active ? 'step' : undefined} className="group flex min-w-0 flex-col items-center gap-1.5 text-center disabled:cursor-not-allowed">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all ${active ? 'scale-110 bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white ring-4 ring-indigo-500/15' : complete ? 'bg-emerald-500 text-white' : 'border-2 border-[var(--border)] bg-[var(--bg-surface2)] text-[var(--text-3)]'}`}>{complete ? '✓' : step.number}</span>
                <span className={`max-w-full truncate text-[10px] font-semibold sm:text-xs ${active ? 'text-indigo-500 dark:text-indigo-300' : complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-3)]'}`}>
                  <span className="sm:hidden">{step.short}</span><span className="hidden sm:inline">{step.title}</span>
                </span>
              </button>
              {index < EDITOR_STEPS.length - 1 && <span aria-hidden="true" className={`mx-1 mt-[17px] h-0.5 min-w-2 flex-1 rounded-full sm:mx-3 ${complete ? 'bg-gradient-to-r from-emerald-500 to-indigo-500' : 'bg-[var(--border)]'}`} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
