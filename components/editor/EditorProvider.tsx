'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Id, MediaRef, Project } from '../../lib/editor/model';
import { createProject, makeId } from '../../lib/editor/model';
import { addMedia } from '../../lib/editor/ops';
import { createHistory, historyReducer, redoLabel, undoLabel, type History } from '../../lib/editor/history';
import { FORMATS, type AspectId, type FormatPreset } from '../../lib/render/layout';
import { isVideoFile, probeVideo } from '../../lib/media/probe';

export const MAX_MEDIA = 20;
/** New clips from long files start at a minute so a Short is not over its limit by default. */
const SHORT_DEFAULT_CLIP_SECONDS = 60;

export function defaultClipCap(format: FormatPreset) {
  return format.maxSeconds === null ? null : SHORT_DEFAULT_CLIP_SECONDS;
}

export type Notify = (message: string, type?: 'success' | 'error' | 'info') => void;

interface EditorContextValue {
  project: Project;
  format: FormatPreset;
  history: History<Project>;
  apply: (op: (project: Project) => Project, label: string, coalesceKey?: string) => void;
  seal: () => void;
  undo: () => void;
  redo: () => void;
  mediaUrl: (mediaId: Id) => string | null;
  addFiles: (files: File[]) => Promise<void>;
  importing: boolean;
  notify: Notify;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor() {
  const value = useContext(EditorContext);
  if (!value) throw new Error('useEditor must be used inside EditorProvider');
  return value;
}

export function EditorProvider({ formatId, notify, children }: { formatId: AspectId; notify: Notify; children: ReactNode }) {
  const [history, dispatch] = useReducer(historyReducer<Project>, formatId, (id: AspectId) => createHistory(createProject(id)));
  const [importing, setImporting] = useState(false);
  // Files stay outside the project (it only stores a description), keyed by media id.
  const files = useRef(new Map<Id, { file: File; url: string }>());
  const projectRef = useRef(history.present);
  projectRef.current = history.present;
  const format = FORMATS[formatId];

  useEffect(() => {
    const owned = files.current;
    return () => owned.forEach(({ url }) => URL.revokeObjectURL(url));
  }, []);

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
  const mediaUrl = useCallback((mediaId: Id) => files.current.get(mediaId)?.url ?? null, []);

  const addFiles = useCallback(async (picked: File[]) => {
    const videos = picked.filter(isVideoFile);
    const problems: string[] = [];
    if (videos.length < picked.length) problems.push(`${picked.length - videos.length} file(s) skipped: choose MP4, WebM, MOV or M4V videos.`);
    const room = MAX_MEDIA - Object.keys(projectRef.current.media).length;
    if (videos.length > room) problems.push(`A project can hold up to ${MAX_MEDIA} videos.`);
    setImporting(true);
    const added: MediaRef[] = [];
    for (const file of videos.slice(0, Math.max(0, room))) {
      const url = URL.createObjectURL(file);
      try {
        const info = await probeVideo(url, file.name);
        const id = makeId();
        files.current.set(id, { file, url });
        added.push({ id, kind: 'video', name: file.name, size: file.size, lastModified: file.lastModified, ...info });
      } catch (error) {
        URL.revokeObjectURL(url);
        problems.push((error as Error).message);
      }
    }
    setImporting(false);
    if (added.length) {
      dispatch({ type: 'apply', op: (project) => addMedia(project, added, defaultClipCap(format)), label: added.length === 1 ? 'Add video' : 'Add videos' });
      notify(`${added.length} video${added.length === 1 ? '' : 's'} added to your story.`, 'success');
    }
    if (problems.length) notify(problems.join(' '), 'error');
  }, [format, notify]);

  const value = useMemo<EditorContextValue>(() => ({
    project: history.present, format, history, apply, seal, undo, redo, mediaUrl, addFiles, importing, notify,
  }), [history, format, apply, seal, undo, redo, mediaUrl, addFiles, importing, notify]);

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
