'use client';

import { useRef, useState } from 'react';
import { setMediaCaptions } from '../../lib/editor/ops';
import { parseCaptionReport } from '../../lib/media/captions';
import { pairCaptions } from '../../lib/media/pairCaptions';
import { extractZipMedia, listZipMedia, VIDEO_ZIP_LIMITS, type ZipMediaCandidate } from '../../lib/videoAssets';
import { useEditor } from './EditorProvider';
import { secondaryButton } from './steps/StepCard';

interface Review {
  file: File;
  candidates: ZipMediaCandidate[];
  selected: Set<string>;
}

const MB = 1024 * 1024;

/** Lists what is inside a ZIP, lets people choose, then imports videos and their captions. */
export default function ZipImport() {
  const { apply, addFiles, importing, notify } = useEditor();
  const pickerRef = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);

  const inspect = async (file: File) => {
    setBusy(true);
    try {
      const candidates = (await listZipMedia(file)).filter((entry) => entry.kind === 'video' || entry.kind === 'captions');
      if (!candidates.length) throw new Error('No videos or caption files were found in that ZIP.');
      setReview({ file, candidates, selected: new Set(candidates.map((entry) => entry.name)) });
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (name: string) => setReview((current) => {
    if (!current) return current;
    const selected = new Set(current.selected);
    if (selected.has(name)) selected.delete(name); else selected.add(name);
    return { ...current, selected };
  });

  const importSelected = async () => {
    if (!review) return;
    const chosen = review.candidates.filter((entry) => review.selected.has(entry.name));
    setBusy(true);
    try {
      const extracted = await extractZipMedia(review.file, chosen);
      const videos = extracted.filter((item) => item.kind === 'video').map((item) => item.file);
      const captions = extracted.filter((item) => item.kind === 'captions').map((item) => item.file);
      const added = await addFiles(videos);
      const pairs = pairCaptions(added.map((item) => item.name), captions.map((file) => file.name));
      let unreadable = 0;
      for (const captionFile of captions) {
        const media = added.find((item) => item.name === pairs.get(captionFile.name));
        if (!media) continue;
        const report = parseCaptionReport(await captionFile.text());
        unreadable += report.unreadable;
        if (report.cues.length) apply((p) => setMediaCaptions(p, media.id, report.cues), 'Add captions');
      }
      const unmatched = captions.length - pairs.size;
      if (unmatched > 0) notify(`${unmatched} caption file(s) did not match a video by name and were skipped.`, 'info');
      if (unreadable > 0) notify(`${unreadable} caption entr${unreadable === 1 ? 'y' : 'ies'} could not be read and were skipped.`, 'info');
      setReview(null);
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={secondaryButton} onClick={() => pickerRef.current?.click()} disabled={busy || importing}>Choose a ZIP folder</button>
      <input ref={pickerRef} type="file" accept=".zip,application/zip" className="hidden"
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void inspect(file); }} />
      {review && (
        <div className="mt-4 w-full rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Choose what to import from {review.file.name}</h3>
              <p className="mt-1 text-xs text-[var(--text-2)]">Caption files are matched to the video with the same name. Other files are ignored. Limits: {VIDEO_ZIP_LIMITS.compressedBytes / MB} MB ZIP, {VIDEO_ZIP_LIMITS.fileBytes / MB} MB per video.</p>
            </div>
            <button type="button" className="text-[var(--text-3)] hover:text-[var(--text-1)]" aria-label="Close ZIP review" onClick={() => setReview(null)}>✕</button>
          </div>
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
            {review.candidates.map((entry) => (
              <label key={entry.name} className="flex cursor-pointer items-center gap-3 rounded-lg bg-[var(--bg-surface)] px-3 py-2 text-sm">
                <input type="checkbox" checked={review.selected.has(entry.name)} onChange={() => toggle(entry.name)} />
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                <span className="text-xs text-[var(--text-3)]">{entry.kind === 'video' ? 'Video' : 'Captions'} · {(entry.expandedSize / MB).toFixed(1)} MB</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
              disabled={busy || !review.candidates.some((entry) => entry.kind === 'video' && review.selected.has(entry.name))} onClick={() => void importSelected()}>
              {busy ? 'Importing…' : 'Import selected files'}
            </button>
            <button type="button" className={secondaryButton} onClick={() => setReview(null)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
