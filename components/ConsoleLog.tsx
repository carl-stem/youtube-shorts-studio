'use client';

interface Props {
  logs: string[];
  onClear: () => void;
}

export default function ConsoleLog({ logs, onClear }: Props) {
  return (
    <section className="bg-[var(--log-bg)] border border-[var(--border)] rounded-2xl p-4 shadow-inner">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-2)]">Studio Console Log</span>
        <button onClick={onClear} className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition cursor-pointer">
          Clear
        </button>
      </div>
      <div className="mono text-xs text-[var(--log-text)] space-y-0.5 h-32 overflow-y-auto whitespace-pre-wrap">
        {logs.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </section>
  );
}
