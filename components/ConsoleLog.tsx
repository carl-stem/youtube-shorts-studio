'use client';

interface Props {
  logs: string[];
  onClear: () => void;
}

export default function ConsoleLog({ logs, onClear }: Props) {
  return (
    <section className="bg-[#0b0c10] border border-slate-800 rounded-2xl p-4 shadow-inner">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Studio Console Log</span>
        <button onClick={onClear} className="text-xs text-slate-500 hover:text-slate-300 transition cursor-pointer">
          Clear
        </button>
      </div>
      <div className="mono text-xs text-emerald-400 space-y-0.5 h-32 overflow-y-auto whitespace-pre-wrap">
        {logs.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </section>
  );
}
