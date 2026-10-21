'use client';

import { useEffect, useRef, useState } from 'react';
import type { AccountStatus, DownloadItem } from '../../../types';
import { duration, formatTimecode } from '../../../lib/editor/timeline';
import { canRecordInBrowser, recordSequence } from '../../../lib/render/recorderExport';
import { getSupportedMimeType } from '../../../lib/mediaCodec';
import type { SequencePlayer } from '../../../lib/render/sequencePlayer';
import PublishClip from '../../PublishClip';
import { useEditor } from '../EditorProvider';
import LengthNotice, { isOverLength } from '../LengthNotice';
import { StepCard, primaryButton, secondaryButton } from './StepCard';

const VIDEO_BITS_PER_SECOND = 8_000_000;

interface Props {
  player: SequencePlayer | null;
  canvas: HTMLCanvasElement | null;
  accounts: AccountStatus | null;
  /** Kept by the parent so the list survives moving between steps. */
  downloads: DownloadItem[];
  onExported: (item: DownloadItem) => void;
  onExportingChange: (exporting: boolean) => void;
  onBack: () => void;
}

function safeName(name: string) {
  return name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'my-video';
}

export default function ReviewShare({ player, canvas, accounts, downloads, onExported, onExportingChange, onBack }: Props) {
  const { project, format, notify } = useEditor();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const total = duration(project);
  const tooLong = isOverLength(total, format.maxSeconds);

  const [codecLabel, setCodecLabel] = useState('');
  useEffect(() => { setSupported(canRecordInBrowser()); setCodecLabel(getSupportedMimeType().label); }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  const download = (item: DownloadItem) => {
    const anchor = document.createElement('a');
    anchor.href = item.url;
    anchor.download = item.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const startExport = async () => {
    if (!player || !canvas) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(0);
    onExportingChange(true);
    try {
      const { blob, format: codec } = await recordSequence({
        player, canvas, totalSeconds: total, fps: format.fps, videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        signal: controller.signal, onProgress: (fraction) => setProgress(Math.round(fraction * 100)),
      });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const item: DownloadItem = {
        filename: `${safeName(project.name === 'Untitled project' ? `my-${format.label.toLowerCase()}` : project.name)}-${stamp}.${codec.ext}`,
        url, sizeBytes: blob.size, durationSeconds: total, width: format.width, height: format.height,
      };
      onExported(item);
      download(item);
      notify(`${item.filename} is ready.`, 'success');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') notify((error as Error).message, 'error');
      else notify('Export cancelled.', 'info');
    } finally {
      abortRef.current = null;
      setProgress(null);
      onExportingChange(false);
    }
  };

  const exporting = progress !== null;
  return (
    <StepCard step={4} eyebrow="Make your final video" title="Review & share" hint="Watch your story in the preview, then export it. Export plays your story once in real time, so keep this tab open.">
      <div className="flex flex-wrap items-center gap-3">
        {!exporting
          ? <button type="button" className={primaryButton} onClick={() => void startExport()} disabled={!supported || tooLong || total <= 0 || !player}>Export my {format.label} · {formatTimecode(total)}</button>
          : <button type="button" className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500" onClick={() => abortRef.current?.abort()}>Cancel export</button>}
        <span className="text-xs text-[var(--text-2)]">{format.width} × {format.height} · {format.fps} fps{codecLabel ? ` · ${codecLabel}` : ''}</span>
      </div>
      <LengthNotice />
      {supported === false && <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">This browser can&apos;t record video. Try current Chrome, Edge, or Safari on a computer.</p>}
      {exporting && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-[var(--text-2)]"><span>Recording your story</span><span>{progress}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-surface2)]"><div className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all" style={{ width: `${progress}%` }} /></div>
        </div>
      )}
      {downloads.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-500">Your exports</h3>
          {downloads.map((item) => (
            <div key={item.url} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-[var(--bg-surface2)] px-3 py-2">
              <span className="truncate text-xs">{item.filename} · {(item.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
              <span className="flex shrink-0 items-center gap-2">
                <PublishClip item={item} accounts={accounts} />
                <button type="button" className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500" onClick={() => download(item)}>Download</button>
              </span>
            </div>
          ))}
          {!accounts?.google && !accounts?.tiktok && <p className="text-[11px] text-[var(--text-3)]">To publish, connect YouTube or TikTok with the Accounts button at the top of the page.</p>}
        </div>
      )}
      <div className="mt-5 flex justify-start border-t border-indigo-500/10 pt-4">
        <button type="button" className={secondaryButton} onClick={onBack} disabled={exporting}>← Make it yours</button>
      </div>
      <span className="sr-only" aria-live="polite">{exporting ? `Exporting ${progress} percent` : ''}</span>
    </StepCard>
  );
}
