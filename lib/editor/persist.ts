// Projects and their files, kept in this browser's IndexedDB. Browser only.
// Each imported file is stored as a copy up to MEDIA_COPY_LIMIT; bigger files
// are found again with the relink flow when the project is reopened.

import type { Id, Project } from './model';
import { parseProject } from './schema';
import { duration } from './timeline';

const DB_NAME = 'shorts-studio';
const DB_VERSION = 1;
export const MEDIA_COPY_LIMIT = 512 * 1024 * 1024;

export interface ProjectSummary {
  id: Id;
  name: string;
  updatedAt: string;
  format: Project['format'];
  clipCount: number;
  durationSeconds: number;
}

interface MediaRecord {
  key: string;
  projectId: Id;
  mediaId: Id;
  file: File;
}

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser cannot save projects.')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'key' }).createIndex('projectId', 'projectId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = null; reject(request.error ?? new Error('Could not open saved projects.')); };
  });
  return opening;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Saving failed.'));
  });
}

async function store(name: 'projects' | 'media', mode: IDBTransactionMode) {
  return (await open()).transaction(name, mode).objectStore(name);
}

export async function saveProject(project: Project) {
  await done((await store('projects', 'readwrite')).put(project));
}

export async function loadProject(id: Id): Promise<Project | null> {
  const raw: unknown = await done((await store('projects', 'readonly')).get(id));
  if (!raw) return null;
  const result = parseProject(raw);
  if (!result.ok) throw new Error(result.error);
  return result.project;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all: unknown[] = await done((await store('projects', 'readonly')).getAll());
  return all
    .map((raw) => parseProject(raw))
    .flatMap((result) => (result.ok ? [result.project] : []))
    .map((project) => ({
      id: project.id, name: project.name, updatedAt: project.updatedAt, format: project.format,
      clipCount: project.story.length, durationSeconds: duration(project),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteProject(id: Id) {
  await done((await store('projects', 'readwrite')).delete(id));
  const media = await store('media', 'readwrite');
  const keys = await done(media.index('projectId').getAllKeys(id));
  await Promise.all(keys.map((key) => done(media.delete(key))));
}

/** Keeps a copy of an imported file. Returns false when it is too big to copy. */
export async function saveMediaFile(projectId: Id, mediaId: Id, file: File): Promise<boolean> {
  if (file.size > MEDIA_COPY_LIMIT) return false;
  const record: MediaRecord = { key: `${projectId}:${mediaId}`, projectId, mediaId, file };
  await done((await store('media', 'readwrite')).put(record));
  return true;
}

/** Stored file copies for a project; files no longer in the project are cleaned up. */
export async function loadMediaFiles(project: Project): Promise<Map<Id, File>> {
  const media = await store('media', 'readwrite');
  const records = (await done(media.index('projectId').getAll(project.id))) as MediaRecord[];
  const files = new Map<Id, File>();
  const removals: Promise<unknown>[] = [];
  for (const record of records) {
    if (project.media[record.mediaId]) files.set(record.mediaId, record.file);
    else removals.push(done(media.delete(record.key)));
  }
  await Promise.all(removals);
  return files;
}

/** Asks the browser not to clear saved projects when space runs low. */
export async function requestPersistentStorage() {
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
}
