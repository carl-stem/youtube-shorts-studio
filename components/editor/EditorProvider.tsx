'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Id, MediaRef, Project, VideoMedia } from '../../lib/editor/model';
import { makeId } from '../../lib/editor/model';
import { addMedia, setMusic } from '../../lib/editor/ops';
import { createHistory, historyReducer, redoLabel, undoLabel, type History } from '../../lib/editor/history';
import { requestPersistentStorage, saveMediaFile, saveProject } from '../../lib/editor/persist';
import { FORMATS, type FormatPreset } from '../../lib/render/layout';
import { isAudioFile, isVideoFile, probeAudio, probeVideo } from '../../lib/media/probe';

export const MAX_MEDIA = 20;
/** New clips from long files start at a minute so a Short is not over its limit by default. */
const SHORT_DEFAULT_CLIP_SECONDS = 60;
const AUTOSAVE_DELAY_MS = 1000;
/** A relinked file must be this close in length to the one the project remembers. */
const RELINK_TOLERANCE_SECONDS = 0.5;

export function defaultClipCap(format: FormatPreset) {
  return format.maxSeconds === null ? null : SHORT_DEFAULT_CLIP_SECONDS;
}

export type Notify = (message: string, type?: 'success' | 'error' | 'info') => void;
export type SaveState = 'saved' | 'saving' | 'error';

interface EditorContextValue {
  project: Project;
  format: FormatPreset;
  history: History<Project>;
  apply: (op: (project: Project) => Project, label: string, coalesceKey?: string) => void;
  seal: () => void;
  undo: () => void;
  redo: () => void;
  mediaUrl: (mediaId: Id) => string | null;
  addFiles: (files: File[]) => Promise<VideoMedia[]>;
  setMusicFile: (file: File) => Promise<void>;
  /** Files the project uses that this browser does not have; they need relinking. */
  missing: MediaRef[];
  relink: (mediaId: Id, file: File) => Promise<boolean>;
  saveState: SaveState;
  importing: boolean;
  notify: Notify;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor() {
  const value = useContext(EditorContext);
  if (!value) throw new Error('useEditor must be used inside EditorProvider');
  return value;
}

interface Props {
  initial: Project;
  initialFiles: Map<Id, File>;
  notify: Notify;
  children: ReactNode;
}

export function EditorProvider({ initial, initialFiles, notify, children }: Props) {
  const [history, dispatch] = useReducer(historyReducer<Project>, initial, createHistory<Project>);
  const [importing, setImporting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  // Files stay outside the project (it only stores a description), keyed by media id.
  // filesVersion changes whenever one is added, so derived values can update.
  const files = useRef<Map<Id, { file: File; url: string }> | null>(null);
  if (!files.current) files.current = new Map(Array.from(initialFiles, ([id, file]) => [id, { file, url: URL.createObjectURL(file) }]));
  const [filesVersion, setFilesVersion] = useState(0);
  const projectRef = useRef(history.present);
  projectRef.current = history.present;
  const project = history.present;
  const format = FORMATS[project.format];

  useEffect(() => {
    const owned = files.current;
    return () => owned?.forEach(({ url }) => URL.revokeObjectURL(url));
  }, []);

  // Autosave a moment after the last edit, right away when the tab is hidden, and
  // on leaving the editor. A project with no files yet is not worth listing.
  const firstSave = useRef(true);
  const dirty = useRef(false);
  useEffect(() => () => { if (dirty.current) void saveProject(projectRef.current).catch(() => undefined); }, []);
  useEffect(() => {
    if (!Object.keys(project.media).length) return;
    dirty.current = true;
    const save = () => {
      dirty.current = false;
      setSaveState('saving');
      saveProject(projectRef.current)
        .then(() => {
          setSaveState('saved');
          if (firstSave.current) { firstSave.current = false; void requestPersistentStorage(); }
        })
        .catch(() => { dirty.current = true; setSaveState('error'); });
    };
    const timer = window.setTimeout(save, AUTOSAVE_DELAY_MS);
    const onHide = () => { if (document.hidden) { window.clearTimeout(timer); save(); } };
    document.addEventListener('visibilitychange', onHide);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onHide); };
  }, [project]);

  const keepFile = useCallback(async (mediaId: Id, file: File) => {
    files.current?.set(mediaId, { file, url: URL.createObjectURL(file) });
    setFilesVersion((value) => value + 1);
    try {
      if (!(await saveMediaFile(projectRef.current.id, mediaId, file))) {
        notify(`${file.name} is too big to keep a copy of. You will be asked to find it again when you reopen this project.`, 'info');
      }
    } catch {
      notify(`This browser is out of space to keep ${file.name}. You will be asked to find it again next time.`, 'info');
    }
  }, [notify]);

  const apply = useCallback((op: (project: Project) => Project, label: string, coalesceKey?: string) => {
    dispatch({ type: 'apply', op, label, coalesceKey });
  }, []);
  const seal = useCallback(() => dispatch({ type: 'seal' }), []);
  const undo = useCallback(() => {
    const label = undoLabel(history);
    if (!label) return;
    dispatch({ type: 'undo' });
    notify(`Undid: ${label}`, 'info');
  }, [history, notify]);
  const redo = useCallback(() => {
    const label = redoLabel(history);
    if (!label) return;
    dispatch({ type: 'redo' });
    notify(`Redid: ${label}`, 'info');
  }, [history, notify]);
  const mediaUrl = useCallback((mediaId: Id) => files.current?.get(mediaId)?.url ?? null, []);

  const addFiles = useCallback(async (picked: File[]) => {
    const videos = picked.filter(isVideoFile);
    const problems: string[] = [];
    if (videos.length < picked.length) problems.push(`${picked.length - videos.length} file(s) skipped: choose MP4, WebM, MOV or M4V videos.`);
    const room = MAX_MEDIA - Object.values(projectRef.current.media).filter((item) => item.kind === 'video').length;
    if (videos.length > room) problems.push(`A project can hold up to ${MAX_MEDIA} videos.`);
    setImporting(true);
    const added: VideoMedia[] = [];
    for (const file of videos.slice(0, Math.max(0, room))) {
      const url = URL.createObjectURL(file);
      try {
        const info = await probeVideo(url, file.name);
        const item: VideoMedia = { id: makeId(), kind: 'video', name: file.name, size: file.size, lastModified: file.lastModified, ...info };
        await keepFile(item.id, file);
        added.push(item);
      } catch (error) {
        problems.push((error as Error).message);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    setImporting(false);
    if (added.length) {
      dispatch({ type: 'apply', op: (current) => addMedia(current, added, defaultClipCap(FORMATS[current.format])), label: added.length === 1 ? 'Add video' : 'Add videos' });
      notify(`${added.length} video${added.length === 1 ? '' : 's'} added to your story.`, 'success');
    }
    if (problems.length) notify(problems.join(' '), 'error');
    return added;
  }, [keepFile, notify]);

  const setMusicFile = useCallback(async (file: File) => {
    if (!isAudioFile(file)) { notify('Choose a music file such as MP3, M4A or WAV.', 'error'); return; }
    const url = URL.createObjectURL(file);
    try {
      const { duration } = await probeAudio(url, file.name);
      const id = makeId();
      await keepFile(id, file);
      dispatch({ type: 'apply', op: (current) => setMusic(current, { id, kind: 'audio', name: file.name, size: file.size, lastModified: file.lastModified, duration }), label: 'Add music' });
      notify(`${file.name} will play under your video.`, 'success');
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [keepFile, notify]);

  /** Accepts a file for missing media only if its length matches what the project remembers. */
  const relink = useCallback(async (mediaId: Id, file: File) => {
    const expected = projectRef.current.media[mediaId];
    if (!expected) return false;
    const url = URL.createObjectURL(file);
    try {
      const found = expected.kind === 'video' ? await probeVideo(url, file.name) : await probeAudio(url, file.name);
      if (Math.abs(found.duration - expected.duration) > RELINK_TOLERANCE_SECONDS) {
        notify(`${file.name} is not the same length as ${expected.name}, so it is probably a different file.`, 'error');
        return false;
      }
      await keepFile(mediaId, file);
      notify(`${expected.name} found.`, 'success');
      return true;
    } catch (error) {
      notify((error as Error).message, 'error');
      return false;
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [keepFile, notify]);

  const missing = useMemo(
    () => (filesVersion >= 0 ? Object.values(project.media).filter((item) => !files.current?.has(item.id)) : []),
    [project.media, filesVersion],
  );

  const value = useMemo<EditorContextValue>(() => ({
    project, format, history, apply, seal, undo, redo, mediaUrl, addFiles, setMusicFile, missing, relink, saveState, importing, notify,
  }), [project, format, history, apply, seal, undo, redo, mediaUrl, addFiles, setMusicFile, missing, relink, saveState, importing, notify]);

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
