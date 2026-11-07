// Account-scoped, read-only ATproto ingestion. Snapback owns the rebuildable
// index; a complete stable scan replaces its visible generation atomically.
import { createHash, randomBytes } from 'node:crypto';
import { safeFetchWrap } from '@atproto-labs/fetch-node';

const collection = 'app.bsky.feed.post';
const didPattern = /^did:(plc:[a-z2-7]{24}|web:[A-Za-z0-9._:%-]+)$/;
export const recordKey = uri => createHash('sha256').update(uri).digest('hex');
function intent() {
  let n = BigInt('0x' + randomBytes(16).toString('hex')), id = '';
  for (let i = 0; i < 26; i++) { id = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Number(n & 31n)] + id; n >>= 5n; }
  return id;
}
const publicFetch = safeFetchWrap({ timeout: 12000, responseMaxSize: 8 * 1024 * 1024 });

export function normalizePublicRecord(did, item) {
  const value = item?.value, prefix = `at://${did}/${collection}/`;
  if (typeof item?.uri !== 'string' || !item.uri.startsWith(prefix) ||
      !/^[A-Za-z0-9._~:-]{1,512}$/.test(item.uri.slice(prefix.length)) || item.uri.length > 2048 ||
      typeof item.cid !== 'string' || !/^b[a-z2-7]{8,255}$/.test(item.cid) ||
      value?.$type !== collection || typeof value.text !== 'string' || value.text.length > 12000 ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || Date.parse(value.createdAt) < 0) {
    throw new Error('Invalid public post');
  }
  const reference = ref => {
    if (!ref) return '';
    if (typeof ref.uri !== 'string' || ref.uri.length > 2048 || !/^at:\/\/did:[^/]+\/app\.bsky\.feed\.post\/[^/]+$/.test(ref.uri)) throw new Error('Invalid reply reference');
    return ref.uri;
  };
  const parent = reference(value.reply?.parent), root = reference(value.reply?.root);
  if ((!!parent !== !!root) || (value.reply && !parent)) throw new Error('Incomplete reply reference');
  const record = JSON.stringify(value);
  if (record.length > 65536) throw new Error('Public record too large');
  return { uri: item.uri, key: recordKey(item.uri), rootKey: root ? recordKey(root) : '', isRoot: !parent,
    cid: item.cid, body: value.text, record, parent, root, at: Date.parse(value.createdAt) };
}

export function indexTransport(origin, token, fetcher = fetch) {
  const endpoint = new URL(origin);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))) throw new Error('Unsafe backend origin');
  return async (kind, name, args = {}) => {
    const response = await fetcher(`${endpoint.origin}/${kind}/${name}`, { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ args, ...(kind === 'm' ? { id: intent() } : {}) }), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok || result.denied || result.state === 'failed') throw new Error('Index storage unavailable');
    return result;
  };
}

async function pages(request, operation, args = {}) {
  const rows = [], seen = new Set(); let c;
  do {
    const page = await request('q', operation, { ...args, ...(c ? { c } : {}) });
    if (!Array.isArray(page.data)) throw new Error('Invalid index page');
    rows.push(...page.data); c = page.next;
    if (c && seen.has(c)) throw new Error('Repeated index cursor');
    if (c) seen.add(c);
  } while (c);
  return rows;
}

export function createPublicIndexer({ request, resolveIdentity, fetcher = publicFetch }) {
  let running = false;
  async function cleanup(owner) {
    // Restart-safe cleanup never removes the active or in-progress generation.
    for (;;) {
      const page = await request('q', 'obsoletePublicRecords', { owner });
      if (!page.data?.length) return;
      for (const row of page.data) await request('m', 'removeObsoletePublicRecord', { id: row.id });
    }
  }
  async function sync(account) {
    const owner = account.owner;
    if (!didPattern.test(owner)) return; // Only verified account DIDs are indexed.
    const signal = AbortSignal.timeout(120000);
    try {
      await cleanup(owner);
      const identity = await resolveIdentity(owner, { signal, noCache: true });
      if (identity.did !== owner || identity.didDoc?.id !== owner) throw new Error('Identity mismatch');
      const service = identity.didDoc.service?.find(s => s.id === '#atproto_pds' || s.id === `${owner}#atproto_pds`);
      const endpoint = new URL(service?.serviceEndpoint);
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error('Invalid PDS');
      const pds = endpoint.origin;
      async function rpc(method, args) {
        const response = await fetcher(`${pds}/xrpc/${method}?${new URLSearchParams(args)}`, { signal, redirect: 'error' });
        if (!response.ok) throw new Error('PDS unavailable');
        return response.json();
      }
      const status = await rpc('com.atproto.sync.getRepoStatus', { did: owner });
      if (status.did !== owner || typeof status.active !== 'boolean') throw new Error('Invalid account status');
      if (!status.active) {
        const generation = intent();
        await request('m', 'beginPublicIndex', { owner, generation });
        await request('m', 'finishPublicIndex', { owner, generation, revision: '', pds, expected: 0 });
        await cleanup(owner); return;
      }
      const before = await rpc('com.atproto.sync.getLatestCommit', { did: owner });
      if (typeof before.cid !== 'string' || !before.cid || typeof before.rev !== 'string' || !before.rev || before.rev.length > 128) throw new Error('Missing revision');
      if (account.generation && before.rev === account.revision && pds === account.pds) {
        await request('m', 'checkPublicIndex', { owner, failed: false }); await cleanup(owner); return;
      }
      const generation = intent(), records = new Set(), cursors = new Set();
      await request('m', 'beginPublicIndex', { owner, generation });
      let cursor;
      for (let page = 0; ; page++) {
        if (page >= 200 || signal.aborted) throw new Error('Scan budget exceeded');
        const result = await rpc('com.atproto.repo.listRecords', { repo: owner, collection, limit: '100', ...(cursor ? { cursor } : {}) });
        if (!Array.isArray(result.records) || result.records.length > 100) throw new Error('Invalid records page');
        for (const item of result.records) {
          if (signal.aborted) throw new Error('Scan budget exceeded');
          const record = normalizePublicRecord(owner, item);
          if (records.has(record.uri)) throw new Error('Duplicate record in snapshot');
          records.add(record.uri);
          await request('m', 'stagePublicRecord', { owner, generation, ...record });
        }
        if (result.cursor == null || result.cursor === '') break;
        if (typeof result.cursor !== 'string' || cursors.has(result.cursor) || result.records.length === 0) throw new Error('Invalid PDS cursor');
        cursors.add(result.cursor); cursor = result.cursor;
      }
      const after = await rpc('com.atproto.sync.getLatestCommit', { did: owner });
      if (after.rev !== before.rev || after.cid !== before.cid) throw new Error('Repository changed during scan');
      await request('m', 'finishPublicIndex', { owner, generation, revision: after.rev, pds, expected: records.size });
      await cleanup(owner);
    } catch {
      // Never turn an incomplete scan into authoritative absence. No public
      // text, tokens or raw OAuth errors enter operational logs.
      await request('m', 'checkPublicIndex', { owner, failed: true });
    }
  }
  async function tick() {
    if (running) return;
    running = true;
    try { for (const account of await pages(request, 'publicIndexAccountsList')) await sync(account); }
    finally { running = false; }
  }
  return { tick, sync };
}
