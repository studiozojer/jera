// Disposable Exact fixture: simulated OAuth evidence, real Snapback storage.
// Production never imports this file or exposes its simulated provider.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthStore } from '../auth/store.mjs';
import { createHandler, digest } from '../auth/service.mjs';
import { JeraClient, intentId } from '../scripts/client.mjs';
import { lexicons } from '../contracts/registry.mjs';
import { randomBytes } from 'node:crypto';
import { createPublicIndexer, indexTransport } from '../auth/public-index.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'jera-browser-'));
await mkdir(join(directory, 'snapback'));
await copyFile(root + 'snapback/schema.q', join(directory, 'snapback/schema.q'));
const port = Number(process.env.PORT ?? '4417'), upstream = `http://127.0.0.1:${port + 1}`;
const child = spawn(`${root}node_modules/.bin/snapback4`, ['dev', '--port', String(port + 1), '--no-watch', '--unsafe-dev-doors'], { cwd: directory, stdio: 'inherit' });
const store = new AuthStore(':memory:');
let fixtureServiceToken;
const callbacks = ['studio.zojer.jera.exact:/oauth'];
const client = {
  clientMetadata: { scope: 'atproto' }, jwks: { keys: [] },
  authorize: async (handle, { state }) => {
    // Exact's `authorize` driver consumes one redirect. Simulate the verified
    // provider result here; service.test.mjs exercises the actual handoff.
    const flow = store.get('flow', state), code = randomBytes(32).toString('base64url');
    const did = 'did:plc:' + (handle.startsWith('owner') ? 'a' : handle.startsWith('other') ? 'b' : 'c').repeat(24);
    store.set('flow', state, { ...flow, phase: 'complete', did, code: digest(code) }, 60000);
    const back = new URL(flow.callback); back.searchParams.set('state', state); back.searchParams.set('code', code);
    return back;
  },
  callback: async () => { throw new Error('Browser fixture completes authorization in its start route.'); },
  restore: async did => ({ did }),
};
const handler = createHandler({ client, store, publicOrigin: `http://127.0.0.1:${port}`, callbacks, snapbackOrigin: upstream, serviceToken: 'fixture-only',
searchAccounts: async query => ({ query, available: true, complete: true, items: 'owner.test'.includes(query.toLowerCase()) ? [{ did: 'did:plc:' + 'a'.repeat(24), handle: 'owner.test', displayName: 'Test Owner', avatar: '' }] : [] }),
fetcher: async (url, options) => {
  if (options.headers.authorization === 'Bearer fixture-only') {
    fixtureServiceToken = execFileSync(`${root}node_modules/.bin/snapback4`, ['token', '--service', 'atproto-auth'], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    options.headers.authorization = `Bearer ${fixtureServiceToken}`;
  }
  return fetch(url, options);
} });
const server = createServer(async (req, res) => {
  // Test control only: recover a complete draft authored on another device.
  if (req.method === 'POST' && req.url === '/dev/structured-draft') {
    try {
      const token=execFileSync(`${root}node_modules/.bin/snapback4`, ['token', '--service', 'atproto-auth'], {cwd:directory,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
      const service=new JeraClient(upstream,token);
      const {session}=await service.request('/auth/session',{principal:'did:plc:'+'a'.repeat(24),days:1});
      const owner=new JeraClient(upstream,session.token);
      const audience=(await owner.mutate('createAudience',{name:'Only me',kind:'owner'})).result.id;
      const {ref,digest,definition}=lexicons[0];
      const body='A focused thought ♍︎ ♍️';
      const composition={lexicon:{ref,digest},audience,definition,payload:{purpose:'reflect',body,references:[{uri:'repo:notes/north-star.yao',revision:'abc123'}]}};
      await owner.mutate('saveStructuredDraft',{deviceKey:intentId(),scope:'root:private',body,compositionJson:JSON.stringify({composition,alternatives:{}}),revision:7});
      res.writeHead(200,{'content-type':'application/json'});res.end('{}');
    } catch {res.writeHead(500);res.end('Fixture setup failed.');}
    return;
  }
  if (req.url.startsWith('/oauth/') || req.url.startsWith('/records/') || req.url === '/auth/refresh') {
    // Discovery runs before /oauth/start. Admit only the ephemeral loopback
    // test carrier here; production keeps its explicit callback allowlist.
    if (typeof req.headers.origin === 'string') {
      try {
        const origin = new URL(req.headers.origin);
        if (origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname)) {
          const testCallback = `${origin.origin}/.exact/auth/callback`;
          if (!callbacks.includes(testCallback)) callbacks.push(testCallback);
        }
      } catch { /* The real handler rejects malformed or unlisted origins. */ }
    }
    const callback = new URL(req.url, `http://127.0.0.1:${port}`).searchParams.get('callback');
    if (callback) {
      const parsed = new URL(callback);
      // The web test carrier chooses its own ephemeral loopback port.
      if (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname) && parsed.pathname === '/.exact/auth/callback' && !callbacks.includes(callback)) callbacks.push(callback);
    }
    return handler(req, res);
  }
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const response = await fetch(upstream + req.url, { method: req.method, headers: Object.fromEntries(Object.entries(req.headers).filter(([key]) => !['host', 'connection', 'content-length', 'transfer-encoding', 'expect'].includes(key))), body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    res.writeHead(response.status, Object.fromEntries([...response.headers].filter(([key]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(key))));
    if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch (error) { console.error('Fixture proxy:', error.message); res.writeHead(503); res.end(); }
});
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(upstream + '/auth/config')).ok) break; } catch {}
  await new Promise(resolve => setTimeout(resolve, 100));
}
server.listen(port, '127.0.0.1');
// Synthetic PDS responses exercise the real importer and real Snapback index.
// They are distinct from OAuth and live-network acceptance evidence.
const indexer = createPublicIndexer({
  request: async (...args) => {
    fixtureServiceToken ||= execFileSync(`${root}node_modules/.bin/snapback4`, ['token', '--service', 'atproto-auth'], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return indexTransport(upstream, fixtureServiceToken)(...args);
  },
  resolveIdentity: async did => ({ did, didDoc: { id: did, service: [{ id: '#atproto_pds', serviceEndpoint: 'https://pds.test' }] } }),
  fetcher: async address => {
    const url = new URL(address), method = url.pathname.split('/').at(-1), did = url.searchParams.get('did') || url.searchParams.get('repo');
    if (method === 'com.atproto.sync.getRepoStatus') return Response.json({ did, active: true });
    if (method === 'com.atproto.sync.getLatestCommit') return Response.json({ rev: 'fixture-v1', cid: 'bafyreiaaaaaaaa' });
    const source = key => `at://${did}/app.bsky.feed.post/${key}`;
    const row = (key, text, extra = {}) => ({ uri: source(key), cid: 'bafyreiaaaaaaaa', value: { $type: 'app.bsky.feed.post', text, createdAt: '2026-11-07T00:00:00Z', ...extra } });
    return Response.json({ records: [
      row('root', did.includes('aaaa') ? 'My Bluesky post ♍︎ ♍️ :virgo:' : 'Another account’s Bluesky post', { embed: { $type: 'app.bsky.embed.images', images: [{ alt: 'Synthetic public image', image: { ref: { $link: 'bafyreiaaaaaaaa' } } }] } }),
      ...Array.from({ length: 50 }, (_, i) => row(`earlier-${i}`, `Earlier public post ${i + 1}`, { createdAt: '2026-11-06T00:00:00Z' })),
      row('selfreply', 'My own thread continuation', { reply: { parent: { uri: source('root'), cid: 'bafyreiaaaaaaaa' }, root: { uri: source('root'), cid: 'bafyreiaaaaaaaa' } } }),
      row('gap-reply', 'Own reply after a missing parent', { reply: { parent: { uri: source('deleted-parent'), cid: 'bafyreiaaaaaaaa' }, root: { uri: source('root'), cid: 'bafyreiaaaaaaaa' } } }),
      row('gap-child', 'Continuation below the gap', { reply: { parent: { uri: source('gap-reply'), cid: 'bafyreiaaaaaaaa' }, root: { uri: source('root'), cid: 'bafyreiaaaaaaaa' } } }),
    ] });
  },
});
const indexTimer = setInterval(() => indexer.tick().catch(() => {}), 200); indexTimer.unref();
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.closeAllConnections(); server.close(); child.kill(signal); });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', async code => { server.close(); store.close(); await rm(directory, { recursive: true, force: true }); process.exit(code ?? 0); });
