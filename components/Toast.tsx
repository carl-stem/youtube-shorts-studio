'use client';

export type ToastType = 'success' | 'error' | 'info' | 'loading';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // ms, 0 = permanent
}

interface Props {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export default function ToastContainer({ toasts, onDismiss }: Props) {
  return (
    <div className="fixed bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast-enter flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium pointer-events-auto max-w-sm
            ${t.type === 'success' ? 'bg-emerald-600 text-white' : ''}
            ${t.type === 'error'   ? 'bg-rose-600 text-white'    : ''}
            ${t.type === 'info'    ? 'bg-indigo-600 text-white'  : ''}
            ${t.type === 'loading' ? 'bg-[var(--bg-surface)] text-[var(--text-1)] border border-[var(--border)]' : ''}
          `}
        >
          <span className="text-base leading-none mt-0.5 shrink-0">
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : t.type === 'loading' ? '⟳' : 'ℹ'}
          </span>
          <span className="leading-snug">{t.message}</span>
          {t.type !== 'loading' && (
            <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-70 hover:opacity-100 shrink-0">✕</button>
          )}
        </div>
      ))}
    </div>
  );
}
