'use client';

import { useRef } from 'react';
import type { MusicLevel } from '../../../lib/editor/model';
import { removeMusic, updateMusic } from '../../../lib/editor/ops';
import { duration, formatTimecode } from '../../../lib/editor/timeline';
import { useEditor } from '../EditorProvider';
import { chip, secondaryButton } from '../steps/StepCard';

const LEVELS: Record<MusicLevel, string> = { quiet: 'Quiet', balanced: 'Balanced', loud: 'Loud' };

export default function MusicPanel() {
  const { project, apply, setMusicFile } = useEditor();
  const pickerRef = useRef<HTMLInputElement>(null);
  const music = project.music;
  const song = music ? project.media[music.mediaId] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={secondaryButton} onClick={() => pickerRef.current?.click()}>{music ? 'Choose different music' : 'Add background music'}</button>
        <input ref={pickerRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg" className="hidden"
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void setMusicFile(file); }} />
        {music && <button type="button" className="rounded-lg px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10" onClick={() => apply(removeMusic, 'Remove music')}>Remove music</button>}
      </div>
      {music && song ? (
        <>
          <p className="truncate text-xs text-[var(--text-2)]">♪ {song.name} · {formatTimecode(song.duration)} (your video is {formatTimecode(duration(project))})</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(LEVELS) as MusicLevel[]).map((level) => (
              <button key={level} type="button" className={chip(music.level === level)} aria-pressed={music.level === level} onClick={() => apply((p) => updateMusic(p, { level }), 'Change music level')}>{LEVELS[level]}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={music.duckUnderClips} onChange={(event) => apply((p) => updateMusic(p, { duckUnderClips: event.target.checked }), 'Change music level')} />
            Music gets quieter when your videos have sound
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={music.loop} onChange={(event) => apply((p) => updateMusic(p, { loop: event.target.checked }), 'Change music repeat')} />
            Repeat the music if it ends before the video
          </label>
        </>
      ) : (
        <p className="text-xs text-[var(--text-3)]">Music plays from the start of your video, fades in and out, and is mixed into the export. Use music you have the rights to.</p>
      )}
    </div>
  );
}
