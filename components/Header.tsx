'use client';

import type { ReactNode } from 'react';
import type { AccountStatus, ProjectActions } from '../types';
import ConnectAccounts from './ConnectAccounts';
import ThemeToggle from './ThemeToggle';

interface Props {
  workflowGuide: string;
  /** The Audio/Video switch owned by app/page.tsx. */
  modeSwitch: ReactNode;
  /** Open/Save project and codec badge; only the audio workflow provides them. */
  projectActions: ProjectActions | null;
  onOpenAnalytics?: () => void;
  accounts: AccountStatus | null;
  accountsLoading: boolean;
  onAccountsChanged: () => void;
}

// The app's only header, rendered once by app/page.tsx for both workflows.
export default function Header({ workflowGuide, modeSwitch, projectActions, onOpenAnalytics, accounts, accountsLoading, onAccountsChanged }: Props) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-header)] backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Left: logo + title + workflow guide */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 shrink-0">
            <svg viewBox="0 0 40 40" className="w-6 h-6" fill="none" aria-hidden="true">
              <rect x="6"  y="22" width="4" height="12" rx="2" fill="white" opacity="0.9"/>
              <rect x="12" y="16" width="4" height="18" rx="2" fill="white" opacity="0.9"/>
              <rect x="18" y="10" width="4" height="24" rx="2" fill="white"/>
              <rect x="24" y="14" width="4" height="20" rx="2" fill="white" opacity="0.9"/>
              <rect x="30" y="20" width="4" height="14" rx="2" fill="white" opacity="0.8"/>
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">Shorts Studio</h1>
            <p className="text-xs text-[var(--text-3)] hidden sm:block truncate">{workflowGuide}</p>
          </div>
        </div>

        {modeSwitch}

        {/* Right: project actions (audio only), analytics, accounts, theme, codec badge */}
        <div className="flex flex-wrap items-center gap-2">
          {projectActions && (
            <div className="hidden md:flex items-center gap-2">
              <button onClick={projectActions.onLoad} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-surface2)] hover:bg-[var(--border)] text-[var(--text-2)] border border-[var(--border)] transition cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Open
              </button>
              <button onClick={projectActions.onSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 transition cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save
              </button>
            </div>
          )}
          {onOpenAnalytics && (
            <button
              onClick={onOpenAnalytics}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-surface2)] hover:bg-[var(--border)] text-[var(--text-2)] border border-[var(--border)] transition cursor-pointer"
              title="YouTube Analytics"
              aria-label="Open YouTube analytics"
            >
              📊
            </button>
          )}
          <ConnectAccounts status={accounts} loading={accountsLoading} onChanged={onAccountsChanged} />
          <ThemeToggle />
          {projectActions && (
            <span className="hidden lg:inline text-xs mono px-3 py-1.5 rounded-lg bg-[var(--bg-surface2)] text-[var(--text-2)] border border-[var(--border-input)]">
              {projectActions.codecLabel}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
