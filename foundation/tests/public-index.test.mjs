import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { JeraClient } from '../scripts/client.mjs';
import { createPublicIndexer, indexTransport, normalizePublicRecord, recordKey } from '../auth/public-index.mjs';

const root = new URL('../', import.meta.url).pathname;
const cli = resolve(root, 'node_modules/.bin/snapback4');
const did = 'did:plc:' + 'a'.repeat(24), other = 'did:plc:' + 'b'.repeat(24);
const uri = (key, author = did) => `at://${author}/app.bsky.feed.post/${key}`;
const post = (key, text, reply) => ({ uri: uri(key), cid: 'bafyreiaaaaaaaa', value: {
  $type: 'app.bsky.feed.post', text, createdAt: '2026-11-07T00:00:00Z', ...(reply ? { reply } : {}),
} });
async function start(dir) {
  const child = spawn(cli, ['dev', '--port', '0', '--no-watch'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let error = '', output = '';
  child.stderr.on('data', chunk => { error += chunk; });
  const url = await new Promise((yes, no) => {
    const timer = setTimeout(() => { child.kill(); no(new Error(error || 'Server timed out')); }, 30000);
    child.once('error', e => { clearTimeout(timer); no(e); });
    child.once('exit', code => { clearTimeout(timer); no(new Error(`Server exited ${code}: ${error}`)); });
    child.stdout.on('data', chunk => {
      output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); yes(match[0]); }
    });
  });
  return { url, async stop() { const done = once(child, 'exit'); child.kill(); await done; } };
}

test('public index: real Snapback permissions, stable snapshots, recovery, updates and deletion', { timeout: 120000 }, async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'jera-public-index-'));
  await mkdir(resolve(directory, 'snapback'));
  await copyFile(resolve(root, 'snapback/schema.q'), resolve(directory, 'snapback/schema.q'));
  let server = await start(directory);
  t.after(async () => { await server?.stop(); await rm(directory, { recursive: true, force: true }); });
  const token = execFileSync(cli, ['token', '--service', 'atproto-auth'], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const service = new JeraClient(server.url, token);
  const clients = [];
  for (const principal of [did, other]) {
    const { session } = await service.request('/auth/session', { principal, days: 1 });
    clients.push(new JeraClient(server.url, session.token));
  }
  const [owner, outsider] = clients;
  await owner.mutate('ensurePublicIndex', {});
  await outsider.mutate('ensurePublicIndex', {});
  const accounts = () => service.query('publicIndexAccountsList').then(r => r.data);
  const status = () => owner.query('publicIndexStatus').then(r => r.data);
  const roots = async () => (await owner.query('publicIndexRoots', { generation: (await status()).generation })).data;
  await assert.rejects(owner.query('publicIndexAccountsList'), { code: 'INDEX_WORKER_REQUIRED' });
  await assert.rejects(owner.mutate('beginPublicIndex', { owner: other, generation: 'A'.repeat(26) }), { code: 'INDEX_WORKER_REQUIRED' });
  const reply = { parent: { uri: uri('first'), cid: 'bafyreiaaaaaaaa' }, root: { uri: uri('first'), cid: 'bafyreiaaaaaaaa' } };
  let records = [post('first', 'Original ♍︎ ♍️ :virgo:'), post('second', 'Second post'), post('selfreply', 'My own continuation', reply)];
  let revision = 'revision-1', fault = '', active = true, scans = 0;
  const fetcher = async address => {
    const url = new URL(address), method = url.pathname.split('/').at(-1);
    if (method === 'com.atproto.sync.getRepoStatus') return Response.json({ did, active });
    if (method === 'com.atproto.sync.getLatestCommit') return Response.json({ rev: revision, cid: revision });
    assert.equal(method, 'com.atproto.repo.listRecords');
    assert.equal(url.searchParams.get('repo'), did);
    assert.equal(url.searchParams.get('collection'), 'app.bsky.feed.post');
    scans++;
    if (fault === 'partial' && url.searchParams.has('cursor')) return new Response('', { status: 503 });
    if (fault === 'changing') revision += '-changed';
    if (fault === 'foreign') return Response.json({ records: [{ ...records[0], uri: uri('forged', other) }] });
    const offset = Number(url.searchParams.get('cursor') || 0);
    return Response.json({ records: records.slice(offset, offset + 2), ...(offset + 2 < records.length ? { cursor: String(offset + 2) } : {}) });
  };
  const worker = () => createPublicIndexer({ request: indexTransport(server.url, token), fetcher,
    resolveIdentity: async principal => ({ did: principal, didDoc: { id: principal, service: [{ id: '#atproto_pds', serviceEndpoint: 'https://pds.test' }] } }),
  });
  const sync = async () => worker().sync((await accounts()).find(a => a.owner === did));
  await sync();
  assert.equal((await status()).state, 'ready');
  assert.equal((await roots()).length, 2);
  assert((await roots()).some(p => p.body === 'Original ♍︎ ♍️ :virgo:'));
  assert.equal((await owner.query('publicIndexThread', { generation: (await status()).generation, key: recordKey(uri('first')) })).data.length, 2);
  assert.equal((await outsider.query('publicIndexRoots', { generation: '' })).data.length, 0);
  const priorScans = scans; await sync(); assert.equal(scans, priorScans, 'unchanged revision avoids re-import');
  const visibleGeneration = (await status()).generation;
  await assert.rejects(owner.query('publicIndexRoots', { generation: 'stale' }), { code: 'INDEX_CHANGED' });
  const incomplete = 'X'.repeat(26);
  await service.mutate('beginPublicIndex', { owner: did, generation: incomplete });
  await assert.rejects(service.mutate('finishPublicIndex', { owner: did, generation: incomplete, revision, pds: 'https://pds.test', expected: 1 }), { code: 'INDEX_INCOMPLETE' });
  assert.equal((await status()).generation, visibleGeneration);
  await service.mutate('checkPublicIndex', { owner: did, failed: true });
  await assert.rejects(service.mutate('finishPublicIndex', { owner: did, generation: visibleGeneration, revision, pds: 'https://pds.test', expected: 2 }), { code: 'INDEX_SUPERSEDED' });
  for (const failure of ['partial', 'changing', 'foreign']) {
    fault = failure; revision += '-new'; await sync();
    assert.equal((await status()).state, 'error', failure);
    assert.equal((await status()).generation, visibleGeneration, 'failed scan never publishes partial absence');
    assert.equal((await roots()).length, 2);
  }
  fault = '';
  records = [post('first', 'Updated original'), post('new', 'New post')]; revision = 'revision-2';
  await sync();
  assert.deepEqual((await roots()).map(p => p.body).sort(), ['New post', 'Updated original']);
  assert.equal((await service.query('obsoletePublicRecords', { owner: did })).data.length, 0);
  await server.stop(); server = null; server = await start(directory);
  for (const client of [service, ...clients]) client.origin = server.url;
  assert.equal((await roots()).length, 2, 'indexed records survive process restart');
  records = []; revision = 'revision-3'; await sync();
  assert.equal((await roots()).length, 0, 'a complete empty source removes deleted records');
  records = [post('return', 'Before account deactivation')]; revision = 'revision-4'; await sync();
  active = false; await sync();
  assert.equal((await roots()).length, 0, 'inactive repositories are removed from the index');
});

test('public record boundary rejects foreign authors and malformed reply references', () => {
  assert.throws(() => normalizePublicRecord(did, { ...post('one', 'text'), uri: uri('one', other) }));
  assert.throws(() => normalizePublicRecord(did, post('one', 'text', { parent: { uri: uri('root') } })));
  const item = post('one', ''); item.value.embed = { $type: 'app.bsky.embed.images', images: [] };
  assert.equal(JSON.parse(normalizePublicRecord(did, item).record).embed.$type, 'app.bsky.embed.images');
});
