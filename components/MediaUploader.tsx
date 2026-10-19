'use client';

import type { AlbumTrackFile } from '../types';

interface DropzoneFile { name: string; meta: string }

interface Props {
  albumQueue: AlbumTrackFile[];
  albumIndex: number;
  onAlbumZip: (file: File) => void;
  onAlbumTrackChange: (index: number, patch: Partial<Pick<AlbumTrackFile, 'artist' | 'title'>>) => void;
  onAlbumTrackSelect: (index: number) => void;
  onAlbumCoverChange: (file: File) => void;
  onAlbumNext: () => void;
  albumImporting: boolean;
  albumError: string;
  onClearAlbum: () => void;

  audio: DropzoneFile;
  image: DropzoneFile;
  srt: DropzoneFile;
  onAudioChange: (file: File) => void;
  onImageChange: (file: File) => void;
  onSrtChange: (file: File) => void;
}

export default function MediaUploader({ audio, image, srt, onAudioChange, onImageChange, onSrtChange, albumQueue, albumIndex, onAlbumZip, onAlbumTrackChange, onAlbumTrackSelect, onAlbumCoverChange, onAlbumNext, albumImporting, albumError, onClearAlbum }: Props) {
  const handleFile =
    (cb: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) cb(f);
    };

  const handleAlbumZip = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onAlbumZip(file);
  };
  const activeTrack = albumQueue[albumIndex];

  return (
    <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 shadow-xl">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-400 mb-4 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs">1</span>
        Select Audio, Cover Art &amp; Subtitles
      </h2>

      <div className="mb-4 rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-sm font-semibold">Import a full album</h3><p className="mt-1 text-xs text-[var(--text-2)]">Choose a ZIP with audio tracks, optional cover art, and flexible folder/naming layouts. Files stay on this device.</p></div>
          <label className="cursor-pointer rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">{albumImporting ? 'Inspecting ZIP…' : 'Choose album ZIP'}<input type="file" accept=".zip,application/zip" className="hidden" onChange={handleAlbumZip} disabled={albumImporting} /></label>
        </div>
        {albumError && <p role="alert" className="mt-3 text-sm text-rose-300">{albumError}</p>}
        {albumQueue.length > 0 && activeTrack && <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-indigo-300">Track {albumIndex + 1} of {albumQueue.length} · Next is always your choice</p><button type="button" className="text-xs text-[var(--text-3)] hover:text-[var(--text-1)]" onClick={onClearAlbum}>Clear album queue</button></div>
          <select className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm" aria-label="Select album track" value={albumIndex} onChange={(event) => onAlbumTrackSelect(Number(event.target.value))}>{albumQueue.map((track, index) => <option key={`${track.file.name}-${index}`} value={index}>{index + 1}. {track.title} — {track.artist || 'Unknown artist'}</option>)}</select>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><input className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm" aria-label="Album track title" value={activeTrack.title} onChange={(event) => onAlbumTrackChange(albumIndex, { title: event.target.value })} /><input className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm" aria-label="Album track artist" value={activeTrack.artist} onChange={(event) => onAlbumTrackChange(albumIndex, { artist: event.target.value })} /></div>
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[var(--text-3)]">{activeTrack.file.name}{activeTrack.cover ? ` · Cover: ${activeTrack.cover.name}` : ' · No matched cover art'}</p><div className="flex gap-2"><label className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold">Set cover<input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onAlbumCoverChange(file); }} /></label><button type="button" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white" onClick={onAlbumNext}>{albumIndex === albumQueue.length - 1 ? 'Load this track' : 'Load track into editor'}</button></div></div>
          <p className="text-[11px] text-[var(--text-3)]">Tracks are loaded one at a time; advancing changes the active track only when you choose.</p>
        </div>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Audio */}
        <label className="relative group cursor-pointer flex flex-col items-center justify-center p-5 border-2 border-dashed border-[var(--border-input)] hover:border-indigo-500 rounded-xl bg-[var(--bg-surface2)] hover:bg-indigo-950/10 transition-all text-center">
          <input type="file" accept=".wav,audio/*" className="hidden" onChange={handleFile(onAudioChange)} />
          <div className="w-11 h-11 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-[var(--text-1)] line-clamp-1">{audio.name}</span>
          <span className="text-xs text-[var(--text-2)] mt-1">{audio.meta}</span>
          <span className="text-[10px] text-[var(--text-3)] mt-0.5 lg:hidden">Tap to choose</span>
        </label>

        {/* Image */}
        <label className="relative group cursor-pointer flex flex-col items-center justify-center p-5 border-2 border-dashed border-[var(--border-input)] hover:border-pink-500 rounded-xl bg-[var(--bg-surface2)] hover:bg-pink-950/10 transition-all text-center">
          <input type="file" accept="image/*" className="hidden" onChange={handleFile(onImageChange)} />
          <div className="w-11 h-11 rounded-full bg-pink-500/10 text-pink-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-[var(--text-1)] line-clamp-1">{image.name}</span>
          <span className="text-xs text-[var(--text-2)] mt-1">{image.meta}</span>
        </label>

        {/* SRT */}
        <label className="relative group cursor-pointer flex flex-col items-center justify-center p-5 border-2 border-dashed border-[var(--border-input)] hover:border-violet-500 rounded-xl bg-[var(--bg-surface2)] hover:bg-violet-950/10 transition-all text-center">
          <input type="file" accept=".srt,.vtt" className="hidden" onChange={handleFile(onSrtChange)} />
          <div className="w-11 h-11 rounded-full bg-violet-500/10 text-violet-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-[var(--text-1)] line-clamp-1">{srt.name}</span>
          <span className="text-xs text-[var(--text-2)] mt-1">{srt.meta}</span>
        </label>
      </div>
    </section>
  );
}
