'use client';

import { useState } from 'react';
import Studio from '../components/Studio';
import VideoStudio from '../components/VideoStudio';

type CreationMode = 'video' | 'audio';

export default function Home() {
  const [mode, setMode] = useState<CreationMode>('video');

  const workflowGuide = mode === 'video'
    ? 'Add videos → Choose a moment → Make it yours → Review & export'
    : 'Choose your audio → Style your Short → Edit clips → Preview & export';

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-1)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-header)] px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Shorts Studio</h1>
            <p className="mt-1 text-xs text-[var(--text-3)]">{workflowGuide}</p>
          </div>
          <nav className="flex w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface2)] p-1 sm:w-auto" aria-label="Choose a creation workflow">
            <button
              type="button"
              onClick={() => setMode('video')}
              aria-pressed={mode === 'video'}
              className={`flex-1 rounded-lg px-5 py-2.5 text-sm font-semibold transition sm:flex-none ${mode === 'video' ? 'bg-indigo-600 text-white shadow' : 'text-[var(--text-2)] hover:text-[var(--text-1)]'}`}
            >
              Video Short
            </button>
            <button
              type="button"
              onClick={() => setMode('audio')}
              aria-pressed={mode === 'audio'}
              className={`flex-1 rounded-lg px-5 py-2.5 text-sm font-semibold transition sm:flex-none ${mode === 'audio' ? 'bg-indigo-600 text-white shadow' : 'text-[var(--text-2)] hover:text-[var(--text-1)]'}`}
            >
              Audio Short
            </button>
          </nav>
        </div>
      </header>
      {mode === 'video' ? <VideoStudio /> : <Studio />}
    </div>
  );
}
