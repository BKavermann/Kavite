// The player's own music for the station areas, kept in IndexedDB of this browser only.
// One record per area: { name, blob }. A copy stays in memory, so a chosen file
// still plays this session when the browser refuses storage (private mode, sandbox).
const DB = 'kavite-music', STORE = 'tracks';
const mem = new Map();               // area -> { name, blob } or null after clearing
let dbp = null;

function open() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    setTimeout(() => rej(new Error('timeout')), 2000);   // some sandboxes never answer
  });
  return dbp;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(req.result);
    tx.onerror = () => rej(tx.error);
  });
}

const record = async area => mem.has(area) ? mem.get(area) : run('readonly', s => s.get(area)).catch(() => null);
export const getTrack = area => record(area).then(r => r?.blob || null);
export const trackName = area => record(area).then(r => r?.name || null);

// Resolves true when stored for later sessions, false when only kept in memory
export async function setTrack(area, file) {
  const r = { name: file.name, blob: file };
  mem.set(area, r);
  return run('readwrite', s => s.put(r, area)).then(() => true, () => false);
}
export async function clearTrack(area) {
  mem.set(area, null);
  return run('readwrite', s => s.delete(area)).catch(() => {});
}
