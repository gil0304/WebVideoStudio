// ============================================================
// Persistence — IndexedDB project autosave + imported media
// blobs. Reload restores the edited project (spec §27, §36).
// ============================================================

import type { VideoProject } from '../model/types';
import { registerBlob } from '../engine/sources';

const DB_NAME = 'web-video-studio';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects');
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media');
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { autoIncrement: true });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= openDb());

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}

export interface SavedState {
  project: VideoProject;
  savedAt: number;
  activeSequenceId?: string;
}

export async function saveProject(project: VideoProject, activeSequenceId?: string): Promise<void> {
  const payload: SavedState = { project: JSON.parse(JSON.stringify(project)), savedAt: Date.now(), activeSequenceId };
  await tx('projects', 'readwrite', (s) => s.put(payload, 'current'));
}

export async function loadSavedProject(): Promise<SavedState | null> {
  try {
    const result = await tx<SavedState | undefined>('projects', 'readonly', (s) => s.get('current') as IDBRequest<SavedState | undefined>);
    return result ?? null;
  } catch {
    return null;
  }
}

export async function clearSavedProject(): Promise<void> {
  await tx('projects', 'readwrite', (s) => s.delete('current'));
}

export async function saveSnapshot(project: VideoProject, label: string): Promise<void> {
  await tx('snapshots', 'readwrite', (s) => s.add({ project: JSON.parse(JSON.stringify(project)), label, savedAt: Date.now() }));
}

export async function saveMediaBlob(fileId: string, blob: Blob): Promise<void> {
  await tx('media', 'readwrite', (s) => s.put(blob, fileId));
}

export async function loadAllMediaBlobs(project: VideoProject): Promise<void> {
  const ids = project.assets.map((a) => a.fileId).filter(Boolean) as string[];
  await Promise.all(ids.map(async (id) => {
    try {
      const blob = await tx<Blob | undefined>('media', 'readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>);
      if (blob) registerBlob(id, blob);
    } catch { /* missing media stays offline */ }
  }));
}

/** Download the project as a JSON file (Project Archive). */
export function exportProjectFile(project: VideoProject): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${project.name.replace(/[^\w\-— ]+/g, '')}.wvs.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
