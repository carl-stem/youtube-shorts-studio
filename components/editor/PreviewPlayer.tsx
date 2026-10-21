'use client';

import { useRef } from 'react';
import type { PointerEvent } from 'react';
import type { FormatPreset } from '../../lib/render/layout';
import { formatTimecode } from '../../lib/editor/timeline';

interface Props {
  format: FormatPreset;
  canvasRef: (canvas: HTMLCanvasElement | null) => void;
  time: number;
  total: number;
  playing: boolean;
  disabled: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
  /** When set, dragging on the picture reports how far it moved, as fractions of the frame. */
  onDrag?: (dx: number, dy: number, done: boolean) => void;
}

export default function PreviewPlayer({ format, canvasRef, time, total, playing, disabled, onToggle, onSeek, onDrag }: Props) {
  const tall = format.height > format.width;
  const drag = useRef<{ x: number; y: number } | null>(null);
  const move = (event: PointerEvent<HTMLCanvasElement>, done: boolean) => {
    if (!drag.current || !onDrag) return;
    const { clientWidth, clientHeight } = event.currentTarget;
    onDrag((event.clientX - drag.current.x) / Math.max(1, clientWidth), (event.clientY - drag.current.y) / Math.max(1, clientHeight), done);
    if (done) drag.current = null;
  };
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Preview</h2>
        <span className="text-xs text-[var(--text-3)]">{format.label} · {format.width} × {format.height}</span>
      </div>
      <div className="mt-4 flex justify-center">
        <div className={`w-full overflow-hidden bg-black shadow-2xl ${tall ? 'max-w-[280px] rounded-[28px] border-[8px] border-slate-800' : 'rounded-xl border-4 border-slate-800'}`}>
          <canvas
            ref={canvasRef} width={format.width} height={format.height}
            className={`block w-full ${onDrag && !disabled ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
            style={{ aspectRatio: `${format.width} / ${format.height}` }}
            aria-label={onDrag ? 'Preview of your story; drag to move the picture' : 'Preview of your story'}
            onPointerDown={(event) => { if (!onDrag || disabled) return; drag.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={(event) => move(event, false)}
            onPointerUp={(event) => move(event, true)}
            onPointerCancel={(event) => move(event, true)}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={onToggle} disabled={disabled || total <= 0} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md hover:bg-indigo-500 disabled:opacity-40" aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <input className="min-w-0 flex-1 accent-indigo-500" type="range" min={0} max={Math.max(total, 0.01)} step={0.05} value={Math.min(time, total)} disabled={disabled || total <= 0} onChange={(event) => onSeek(Number(event.target.value))} aria-label="Move through your story" />
        <span className="mono shrink-0 text-xs text-[var(--text-2)]">{formatTimecode(time)} / {formatTimecode(total)}</span>
      </div>
    </div>
  );
}
