'use client';

import type { RefObject } from 'react';

interface Props {
  canvasRef: RefObject<HTMLCanvasElement>;
  previewTimeStr: string;
  isPreviewPlaying: boolean;
  isRendering: boolean;
  onTogglePreview: () => void;
}

export default function CanvasPreview({
  canvasRef, previewTimeStr, isPreviewPlaying, isRendering, onTogglePreview,
}: Props) {
  return (
    <div className="lg:col-span-5 flex flex-col items-center">
      <div className="sticky top-24 w-full max-w-[360px] flex flex-col items-center">
        <div className="w-full flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isPreviewPlaying || isRendering ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'}`} />
            Live 9:16 Canvas (1080×1920)
          </span>
          <span className="text-xs mono text-slate-400">{previewTimeStr}</span>
        </div>

        <div className="relative w-full aspect-[9/16] rounded-[28px] p-2 bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 shadow-2xl shadow-black">
          <div className="w-full h-full rounded-[22px] overflow-hidden bg-black relative">
            <canvas
              ref={canvasRef}
              width={1080}
              height={1920}
              className="w-full h-full object-contain block"
            />
          </div>
        </div>

        <div className="mt-4 w-full bg-[#161822]/90 border border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-400 space-y-1">
          <div className="font-semibold text-slate-200">Tips & Info:</div>
          <p>
            <strong className="text-indigo-300">Live Preview:</strong> Edit title, artist, or cover art and see changes immediately at 60 FPS.
          </p>
          <p>
            <strong className="text-indigo-300">Editable Segments:</strong> Adjust start/duration per clip, add or delete segments freely.
          </p>
          <p>
            <strong className="text-indigo-300">Export:</strong> Web{' '}
            <span className="mono">MediaRecorder</span> records in real-time (1× speed). For batch jobs, render overnight.
          </p>
          <p>
            <strong className="text-indigo-300">SRT / CC:</strong> Upload an SRT file to burn in timed subtitles on every clip.
          </p>
        </div>
      </div>
    </div>
  );
}
