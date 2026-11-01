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
import { randomBytes } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'jera-browser-'));
await mkdir(join(directory, 'snapback'));
await copyFile(root + 'snapback/schema.q', join(directory, 'snapback/schema.q'));
const port = Number(process.env.PORT ?? '4417'), upstream = `http://127.0.0.1:${port + 1}`;
const child = spawn(`${root}node_modules/.bin/snapback4`, ['dev', '--port', String(port + 1), '--no-watch', '--unsafe-dev-doors'], { cwd: directory, stdio: 'inherit' });
const store = new AuthStore(':memory:');
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
const handler = createHandler({ client, store, publicOrigin: `http://127.0.0.1:${port}`, callbacks, snapbackOrigin: upstream, serviceToken: 'fixture-only', fetcher: async (url, options) => {
  if (options.headers.authorization === 'Bearer fixture-only') {
    const token = execFileSync(`${root}node_modules/.bin/snapback4`, ['token', '--service', 'test-auth'], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    options.headers.authorization = `Bearer ${token}`;
  }
  return fetch(url, options);
} });
const server = createServer(async (req, res) => {
  if (req.url.startsWith('/oauth/') || req.url === '/auth/refresh') {
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
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.closeAllConnections(); server.close(); child.kill(signal); });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', async code => { server.close(); store.close(); await rm(directory, { recursive: true, force: true }); process.exit(code ?? 0); });
