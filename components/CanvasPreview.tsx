'use client';

import { useState, useEffect } from 'react';
import type { RefObject } from 'react';

interface Props {
  canvasRef: RefObject<HTMLCanvasElement>;
  previewTimeStr: string;
  isPreviewPlaying: boolean;
  isRendering: boolean;
  canRecord: boolean;
  onTogglePreview: () => void;
}

export default function CanvasPreview({
  canvasRef, previewTimeStr, isPreviewPlaying, isRendering, canRecord, onTogglePreview,
}: Props) {
  const [installPrompt, setInstallPrompt] = useState<Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> }); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setIsInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Sticky wrapper — on desktop this keeps the canvas in view while scrolling controls.
          On mobile the canvas is at the top so it's naturally visible first. */}
      <div className="sticky top-[64px] w-full flex flex-col items-center">

        {/* iOS/unsupported browser warning */}
        {!canRecord && (
          <div className="w-full mb-3 px-3 py-2.5 rounded-xl bg-amber-900/40 border border-amber-500/40 text-xs text-amber-300 flex items-start gap-2">
            <span className="text-base leading-none shrink-0">⚠️</span>
            <span>
              <strong>Export not supported</strong> in this browser. Try Chrome or Edge on desktop.
              Live preview still works.
            </span>
          </div>
        )}

        {/* Time + live indicator */}
        <div className="w-full flex items-center justify-between mb-2 px-1
                        max-w-[260px] sm:max-w-[320px] lg:max-w-none">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-2)] flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isPreviewPlaying || isRendering ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'}`} />
            <span className="hidden sm:inline">Live 9:16 Canvas</span>
            <span className="sm:hidden">Preview</span>
            <span className="text-slate-600 hidden lg:inline">(1080×1920)</span>
          </span>
          <span className="text-xs mono text-[var(--text-2)]">{previewTimeStr}</span>
        </div>

        {/* Phone bezel — capped smaller on mobile so it doesn't dominate the screen */}
        <div className="relative rounded-[28px] p-2 bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 shadow-2xl shadow-black
                        w-full max-w-[260px] sm:max-w-[320px] lg:max-w-[360px]">
          <div className="w-full h-full rounded-[22px] overflow-hidden bg-black aspect-[9/16]">
            <canvas
              ref={canvasRef}
              width={1080}
              height={1920}
              className="w-full h-full object-contain block"
            />
          </div>
        </div>

        {/* Tips — hidden on mobile to preserve vertical space */}
        <div className="hidden lg:block mt-4 w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3.5 text-xs text-[var(--text-2)] space-y-1 max-w-[360px]">
          <div className="font-semibold text-[var(--text-1)]">Tips &amp; Info:</div>
          <p><strong className="text-indigo-300">Live Preview:</strong> Edit title, cover, or style — see changes instantly at 60 fps.</p>
          <p><strong className="text-indigo-300">Editable Segments:</strong> Adjust start/duration per clip, add or delete freely.</p>
          <p><strong className="text-indigo-300">Export:</strong> <span className="mono">MediaRecorder</span> records in real-time (1× speed).</p>
          <p><strong className="text-indigo-300">SRT / CC:</strong> Upload an SRT file to burn timed subtitles into every clip.</p>
        </div>

        {installPrompt && !isInstalled && (
          <button onClick={installApp} className="mt-3 w-full max-w-[360px] flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 text-xs font-semibold transition cursor-pointer">
            📲 Install Shorts Studio as App
          </button>
        )}
      </div>
    </div>
  );
}
