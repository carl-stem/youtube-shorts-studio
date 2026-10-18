'use client';

import ThemeToggle from './ThemeToggle';

interface Props { codecLabel: string }

export default function Header({ codecLabel }: Props) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-header)] backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[var(--text-1)] flex items-center gap-2">
              YouTube Shorts Studio
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                React Edition
              </span>
            </h1>
            <p className="text-xs text-[var(--text-2)]">1080×1920 Vertical Video Generator with Live Audio Spectrum</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="text-xs mono px-3 py-1.5 rounded-lg bg-[var(--bg-surface2)] text-[var(--text-2)] border border-[var(--border-input)]">
            {codecLabel}
          </span>
        </div>
      </div>
    </header>
  );
}
