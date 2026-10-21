'use client';

import type { ReactNode } from 'react';

export const primaryButton = 'rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-40';
export const secondaryButton = 'rounded-xl border border-[var(--border)] bg-[var(--bg-surface2)] px-4 py-2.5 text-sm font-semibold text-[var(--text-1)] transition hover:border-indigo-500/60 disabled:cursor-not-allowed disabled:opacity-40';

interface Props {
  step: number;
  eyebrow: string;
  title: string;
  hint: string;
  children: ReactNode;
}

export function StepCard({ step, eyebrow, title, hint, children }: Props) {
  return (
    <section className="step-enter rounded-2xl border border-indigo-500/15 bg-[var(--bg-surface)] p-5 shadow-xl shadow-indigo-950/5">
      <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-indigo-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
        <span>Step {step}</span><span className="h-1 w-1 rounded-full bg-indigo-400" />{eyebrow}
      </div>
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 mb-4 text-xs text-[var(--text-2)]">{hint}</p>
      {children}
    </section>
  );
}

/** A preset choice button; presets beat sliders for beginners. */
export const chip = (active: boolean) => `rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' : 'border-[var(--border)] bg-[var(--bg-surface2)] hover:border-indigo-500/50'}`;
export const inputClass = 'w-full rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2.5 text-sm text-[var(--text-1)] outline-none focus:border-indigo-500';
