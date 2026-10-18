'use client';
import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <button
      onClick={toggle}
      title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700
                 transition cursor-pointer select-none"
    >
      {dark ? (
        <><span>☀️</span><span className="hidden sm:inline">Light</span></>
      ) : (
        <><span>🌙</span><span className="hidden sm:inline">Dark</span></>
      )}
    </button>
  );
}
