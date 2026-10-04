// On-device storage. Track metadata and audio bytes live in separate IndexedDB
// stores so that listing tracks never reads audio.

const DB_NAME = 'mediaplayer';
const DB_VERSION = 1;
const LAST_KEY = 'mediaplayer.lastTrackId';

let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Storage is in use by another tab'));
  });
  return dbPromise;
}

// Run `fn` in one transaction; resolves with the result of the request it
// returns (if any) once the transaction has committed.
function run(stores, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(stores, mode);
        const req = fn(t);
        t.oncomplete = () => resolve(req?.result);
        t.onerror = t.onabort = () => reject(t.error ?? new Error('Storage transaction failed'));
      }),
  );
}

export async function listTracks() {
  const tracks = await run('tracks', 'readonly', (t) => t.objectStore('tracks').getAll());
  return tracks.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
}

export const getFile = (id) => run('files', 'readonly', (t) => t.objectStore('files').get(id));

export const putTrack = (track) =>
  run('tracks', 'readwrite', (t) => {
    t.objectStore('tracks').put(track);
  });

export const addTrack = (track, bytes) =>
  run(['tracks', 'files'], 'readwrite', (t) => {
    t.objectStore('tracks').put(track);
    t.objectStore('files').put(bytes, track.id);
  });

export const deleteTrack = (id) =>
  run(['tracks', 'files'], 'readwrite', (t) => {
    t.objectStore('tracks').delete(id);
    t.objectStore('files').delete(id);
  });

// Content hash, so loading the same file again finds its existing loops.
// crypto.subtle only exists in a secure context; fall back to file identity.
export async function trackId(bytes, file) {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `file:${file.name}:${file.size}:${file.lastModified}`;
}

export function getLastTrackId() {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function setLastTrackId(id) {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    // Private mode or storage disabled: the app just opens the newest track.
  }
}

// Ask the browser not to evict our data under storage pressure.
export async function requestPersistence() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function isPersisted() {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}
