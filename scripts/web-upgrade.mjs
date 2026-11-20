// Old Jera web releases gave each build checkout its own Exact secret store
// and filesystem. Most recent first, from the archived production bundles.
export const releasedStores = ['592d1f8ba9a0', '82b564692dd9', 'ce5870cc0a58', '71949fc9fd63'];

function openFiles(app, create) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('exact-storage:' + encodeURIComponent(app), 1);
    let missing = false;
    req.onupgradeneeded = () => {
      if (!create) {
        missing = true;
        req.transaction.abort();
        return;
      }
      const files = req.result.createObjectStore('files', { keyPath: 'path' });
      for (const path of ['app:/data', 'app:/cache', 'app:/tmp']) {
        files.add({path, kind:'directory', modifiedMs: Date.now()});
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => missing ? resolve(null) : reject(req.error);
  });
}

async function restoreVaults(app, namespace) {
  const old = await openFiles(app + '@' + namespace, false);
  if (!old) return;
  let target;
  try {
    const rows = await new Promise((resolve, reject) => {
      const req = old.transaction('files').objectStore('files').getAll(IDBKeyRange.bound('app:/data/jera-social-', 'app:/data/jera-social.'));
      req.onsuccess = () => resolve(req.result.filter(row => row.kind === 'file' && /^app:\/data\/jera-social-[0-9a-f]{64}\.json$/.test(row.path)));
      req.onerror = () => reject(req.error);
    });
    if (!rows.length) return;
    target = await openFiles(app, true);
    await new Promise((resolve, reject) => {
      const tx = target.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      for (const row of rows) {
        const present = store.getKey(row.path);
        present.onsuccess = () => { if (present.result === undefined) store.add(row); };
      }
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  } finally { old.close(); target?.close(); }
}

export async function upgradeBrowserStore(key = 'jera-https-snapback-jera-ink-atproto-v1', namespaces = releasedStores) {
  const marker = 'jera.public-exact-storage-v1.' + key;
  if (localStorage.getItem(marker)) return;
  await navigator.locks.request(marker, async () => {
    if (localStorage.getItem(marker)) return;
    const prefix = 'exact.secret.';
    const current = prefix + key;
    const suffixes = ['', '-device', '-login'];
    const source = namespaces.find(ns => suffixes.some(suffix => localStorage.getItem(prefix+'@'+ns+'/'+key+suffix) !== null));
    if (source) {
      await restoreVaults('studio.zojer.jera.exact', source);
      // A login preparation also marks a used (possibly signed-out) store.
      // Never resurrect a grant from an older namespace or replace a new login.
      if (!suffixes.some(suffix => localStorage.getItem(current + suffix) !== null)) {
        // Write the device grant first so retry can finish a partial migration.
        // Roll back our own writes on a storage exception; old keys stay intact.
        const writes = [];
        try {
          for (const suffix of ['-device', '', '-login']) {
            const value = localStorage.getItem(prefix+'@'+source+'/'+key+suffix);
            if (value !== null) { localStorage.setItem(current+suffix, value); writes.push(current+suffix); }
          }
          localStorage.setItem(marker, 'done');
        } catch (error) {
          for (const written of writes) localStorage.removeItem(written);
          throw error;
        }
        return;
      }
    }
    localStorage.setItem(marker, 'done');
  });
}
