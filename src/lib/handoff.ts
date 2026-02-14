/**
 * Tool chaining across pages (decision 15): "run OCR first", "Continue with...".
 *
 * Each tool is its own page, so the bytes cannot stay in a JS variable across
 * the navigation. They are parked in this origin's IndexedDB for the hop, read
 * once by the next page, and deleted at once. Nothing leaves the device; a
 * parked file older than 10 minutes is discarded unread.
 */

const DB = 'qp-handoff';
const STORE = 'files';
const KEY = 'next';
const MAX_AGE_MS = 10 * 60 * 1000;

export interface HandoffFile {
  name: string;
  bytes: Uint8Array;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Parks a file for the next tool page and navigates there. */
export async function handOff(file: HandoffFile, href: string): Promise<void> {
  const db = await open();
  try {
    await tx(db, 'readwrite', (s) => s.put({ name: file.name, bytes: file.bytes, at: Date.now() }, KEY));
  } finally {
    db.close();
  }
  const url = new URL(href, location.href);
  url.searchParams.set('from', 'handoff');
  location.assign(url.pathname + url.search);
}

/** True when this page was opened by handOff(). */
export function hasHandoff(): boolean {
  return new URLSearchParams(location.search).get('from') === 'handoff';
}

/** Takes the parked file (once): it is deleted as it is read. */
export async function takeHandoff(): Promise<HandoffFile | null> {
  if (!hasHandoff() || typeof indexedDB === 'undefined') return null;
  const db = await open();
  try {
    const rec = await tx<{ name: string; bytes: Uint8Array; at: number } | undefined>(db, 'readwrite', (s) => s.get(KEY));
    await tx(db, 'readwrite', (s) => s.delete(KEY));
    // Clean the URL so a reload does not look for the file again.
    history.replaceState(null, '', location.pathname);
    if (!rec || Date.now() - rec.at > MAX_AGE_MS) return null;
    return { name: rec.name, bytes: new Uint8Array(rec.bytes) };
  } finally {
    db.close();
  }
}
