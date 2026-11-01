// Public discovery only. Suggestions never mint sessions or establish identity.
export function createAccountSearch({ pdsOrigin = 'https://pds.jera.ink', searchBluesky = false, fetcher = fetch, now = Date.now } = {}) {
  let cached = null, expires = 0, refreshing = null;
  const remoteCache = new Map();
  async function rpc(method, params, signal) {
    const response = await fetcher(`${pdsOrigin}/xrpc/${method}?${new URLSearchParams(params)}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]), redirect: 'error' });
    if (!response.ok) throw new Error('Public directory unavailable');
    return response.json();
  }
  async function scan() {
    const signal = AbortSignal.timeout(12000);
    const repos = new Map();
    let cursor, complete = true;
    for (let page = 0; page < 5; page++) {
      const data = await rpc('com.atproto.sync.listRepos', { limit: '100', ...(cursor ? { cursor } : {}) }, signal);
      if (!Array.isArray(data.repos)) throw new Error('Invalid directory');
      for (const repo of data.repos) if (repo.active !== false && typeof repo.did === 'string' && /^did:(plc|web):/.test(repo.did)) repos.set(repo.did, repo);
      if (!data.cursor || data.repos.length === 0) { cursor = undefined; break; }
      if (data.cursor === cursor) { complete = false; break; }
      cursor = data.cursor;
    }
    if (cursor) complete = false;
    const queue = [...repos.keys()], items = [];
    await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
      while (queue.length) {
        if (signal.aborted) { complete = false; break; }
        const did = queue.shift();
        try {
          const repo = await rpc('com.atproto.repo.describeRepo', { repo: did }, signal);
          if (repo.did !== did || repo.handleIsCorrect !== true || typeof repo.handle !== 'string' || repo.handle === 'handle.invalid') continue;
          let displayName = '';
          if (repo.collections?.includes('app.bsky.actor.profile')) {
            try {
              const profile = await rpc('com.atproto.repo.getRecord', { repo: did, collection: 'app.bsky.actor.profile', rkey: 'self' }, signal);
              if (typeof profile.value?.displayName === 'string') displayName = profile.value.displayName.slice(0, 160);
            } catch { /* A missing profile must not hide a valid handle. */ }
          }
          items.push({ did, handle: repo.handle, displayName });
        } catch { complete = false; }
      }
    }));
    return { items, complete, available: true };
  }
  async function directory() {
    if (cached && now() < expires) return cached;
    if (!refreshing) refreshing = scan().then(value => {
      cached = value; expires = now() + (value.complete ? 300000 : 30000); return value;
    }, () => {
      cached = { items: [], complete: false, available: false }; expires = now() + 30000; return cached;
    }).finally(() => { refreshing = null; });
    return refreshing;
  }
  async function bluesky(q) {
    if (!searchBluesky) return { items: [], complete: true, available: false };
    for (const [key, entry] of remoteCache) if (entry.until <= now()) remoteCache.delete(key);
    if (!remoteCache.has(q)) {
      if (remoteCache.size >= 100) remoteCache.delete(remoteCache.keys().next().value);
      const result = (async () => {
        try {
          const response = await fetcher(`https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?${new URLSearchParams({ q, limit: '8' })}`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
          if (!response.ok) throw new Error('Public search unavailable');
          const data = await response.json();
          if (!Array.isArray(data.actors)) throw new Error('Invalid search response');
          const items = data.actors.filter(a => typeof a.did === 'string' && /^did:(plc|web):/.test(a.did) && typeof a.handle === 'string' && a.handle !== 'handle.invalid').map(a => ({ did: a.did, handle: a.handle, displayName: typeof a.displayName === 'string' ? a.displayName.slice(0, 160) : '' }));
          return { items, complete: items.length < 8, available: true };
        } catch { return { items: [], complete: false, available: false }; }
      })();
      remoteCache.set(q, { result, until: now() + 30000 });
    }
    return remoteCache.get(q).result;
  }
  return async query => {
    const q = query.trim().replace(/^@/, '').normalize('NFKC').toLowerCase();
    if (q.length < 2 || q.startsWith('did:')) return { query, items: [], available: true, complete: true };
    const [data, remote] = await Promise.all([directory(), bluesky(q)]);
    const matches = data.items.filter(a => `${a.handle}\n${a.displayName}`.normalize('NFKC').toLowerCase().includes(q));
    matches.sort((a, b) => Number(b.handle.toLowerCase().startsWith(q)) - Number(a.handle.toLowerCase().startsWith(q)) || a.handle.localeCompare(b.handle));
    const combined = new Map(matches.map(a => [a.did, a]));
    for (const actor of remote.items) if (!combined.has(actor.did)) combined.set(actor.did, actor);
    return { query, items: [...combined.values()].slice(0, 8), available: data.available || remote.available, complete: data.complete && remote.complete && combined.size <= 8 };
  };
}
