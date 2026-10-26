import type { FranchiseState, SaveMeta } from './types';
import { SAVE_VERSION } from './engine';

/**
 * Browser saves (IndexedDB). Nothing leaves the device unless you export a file.
 *  - Each career has one live save that autosaves after every Continue / roster action.
 *  - "Save a copy" creates an independent slot (not allowed in Ironman).
 *  - Ironman careers have exactly one save, autosaved continuously; there is no way to reload an earlier state.
 *  - Export downloads a gzip-compressed .gridiron file; import validates the version and creates a new slot.
 */
const DB = 'gridiron-franchise';
const STORE = 'saves';
const META = 'meta';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r ? (r as IDBRequest<T>).result : (undefined as T));
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Save aborted (storage full?)'));
  }));
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = await tx<SaveMeta[]>(META, 'readonly', (s) => s.getAll() as IDBRequest<SaveMeta[]>);
  return (all ?? []).sort((a, b) => b.updated.localeCompare(a.updated));
}

export async function writeSave(state: FranchiseState): Promise<void> {
  state.meta.updated = new Date().toISOString();
  state.meta.date = state.date;
  await tx(STORE, 'readwrite', (s) => { s.put(state, state.meta.id); });
  await tx(META, 'readwrite', (s) => { s.put(state.meta, state.meta.id); });
}

export async function readSave(id: string): Promise<FranchiseState | null> {
  const s = await tx<FranchiseState | undefined>(STORE, 'readonly', (st) => st.get(id) as IDBRequest<FranchiseState | undefined>);
  return s ?? null;
}

export async function deleteSave(id: string): Promise<void> {
  await tx(STORE, 'readwrite', (s) => { s.delete(id); });
  await tx(META, 'readwrite', (s) => { s.delete(id); });
}

export async function copySave(state: FranchiseState, name: string): Promise<SaveMeta> {
  if (state.meta.ironman) throw new Error('Ironman careers cannot be copied.');
  const copy: FranchiseState = JSON.parse(JSON.stringify(state));
  copy.meta = { ...copy.meta, id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), name, created: new Date().toISOString() };
  await writeSave(copy);
  return copy.meta;
}

export async function exportSave(state: FranchiseState): Promise<Blob> {
  const json = JSON.stringify({ format: 'gridiron-franchise', version: SAVE_VERSION, state });
  if ('CompressionStream' in window) {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
  }
  return new Blob([json], { type: 'application/json' });
}

export async function importSave(file: File): Promise<SaveMeta> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let text: string;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else text = new TextDecoder().decode(buf);
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('That file is not a GRIDIRON save.'); }
  if (parsed?.format !== 'gridiron-franchise' || !parsed.state?.meta) throw new Error('That file is not a GRIDIRON save.');
  if (parsed.version > SAVE_VERSION) throw new Error(`This save was made by a newer version (v${parsed.version}). Refresh the page to update.`);
  const state = parsed.state as FranchiseState;
  const existing = await readSave(state.meta.id);
  if (existing) state.meta = { ...state.meta, id: state.meta.id + '-' + Date.now().toString(36).slice(-4), name: state.meta.name + ' (imported)' };
  await writeSave(state);
  return state.meta;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}
