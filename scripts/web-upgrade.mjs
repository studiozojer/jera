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
  if (localStorage.getItem(marker) === 'done') return;
  await navigator.locks.request(marker, async () => {
    const pending = localStorage.getItem(marker);
    if (pending === 'done') return;
    const current = 'exact.secret.' + key;
    const suffixes = ['-device', '', '-login'];
    const oldValue = (ns, suffix) => localStorage.getItem('exact.secret.@' + ns + '/' + key + suffix);
    const source = pending || namespaces.find(ns => suffixes.some(suffix => oldValue(ns, suffix) !== null));

    if (source && namespaces.includes(source)) {
      await restoreVaults('studio.zojer.jera.exact', source);
      // A prepared login also identifies the most recently used signed-out store.
      // Persist the chosen namespace before copying across multiple storage keys.
      // A reload can finish that copy. An existing newer login takes precedence.
      const canResume = suffixes.every(suffix => {
        const saved = localStorage.getItem(current + suffix);
        return saved === null || (pending === source && saved === oldValue(source, suffix));
      });
      if (canResume) {
        localStorage.setItem(marker, source);
        for (const suffix of suffixes) {
          const value = oldValue(source, suffix);
          if (value !== null) localStorage.setItem(current + suffix, value);
        }
      }
    }
    localStorage.setItem(marker, 'done');
  });
}
