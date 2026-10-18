'use client';

interface Props {
  currentStep: number;
  completedSteps: number[];
  onChange: (step: number) => void;
}

const STEPS = [
  { n: 1, label: 'Files' },
  { n: 2, label: 'Style' },
  { n: 3, label: 'Clips' },
  { n: 4, label: 'Export' },
];

export default function StepperNav({ currentStep, completedSteps, onChange }: Props) {
  return (
    <div className="flex items-center w-full mb-2">
      {STEPS.map((step, i) => {
        const done   = completedSteps.includes(step.n);
        const active = step.n === currentStep;
        const future = step.n > currentStep && !done;
        const canNav = done || step.n < currentStep;
        return (
          <div key={step.n} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => canNav && onChange(step.n)}
              disabled={!canNav && !active}
              className={`flex flex-col items-center gap-1 cursor-default ${canNav ? 'cursor-pointer' : ''}`}
            >
              {/* Circle */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
                ${active  ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/30 scale-110' : ''}
                ${done    ? 'bg-emerald-600 text-white' : ''}
                ${future  ? 'bg-[var(--bg-surface2)] text-[var(--text-3)] border-2 border-[var(--border)]' : ''}
              `}>
                {done ? '✓' : step.n}
              </div>
              {/* Label */}
              <span className={`text-[10px] font-medium hidden sm:block
                ${active  ? 'text-indigo-400' : ''}
                ${done    ? 'text-emerald-400' : ''}
                ${future  ? 'text-[var(--text-3)]' : ''}
              `}>{step.label}</span>
            </button>
            {/* Connector line (not after last) */}
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 rounded transition-colors
                ${done ? 'bg-emerald-600' : 'bg-[var(--border)]'}
              `} />
            )}
          </div>
        );
      })}
    </div>
  );
}
