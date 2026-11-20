// From app/: EXACT_BACKEND_ORIGIN=http://127.0.0.1:4497 bun exact.mjs web-build --out ../.local/fixture-web
// From the Jera root: bun tests/feed-navigation.browser.mjs .local/fixture-web .local/feed-timing.json
// Requires free fixture ports 4497/4498 and the matching JERA_BACKEND_DIR.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rmdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '../tooling/exact/node_modules/playwright-core/index.mjs';
import { chromium as browserBinary } from '../tooling/exact/scripts/agent-launch.mjs';
import { JeraClient, intentId } from '../scripts/client.mjs';
import { backendDirectory } from '../scripts/backend-location.mjs';

const root = resolve(import.meta.dirname, '..');
const [build, report] = process.argv.slice(2);
if (!build || !report) throw Error('Supply a web build directory and report JSON path.');
const site = resolve(build);
const gatewayOrigin = 'http://127.0.0.1:4497';
const storeOrigin = 'http://127.0.0.1:4498';
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.wasm':'application/wasm', '.json':'application/json', '.svg':'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(site, '.' + (path === '/' ? '/index.html' : path));
  try {
    if (!file.startsWith(site + sep)) throw Error('Invalid path');
    const body = await readFile(file);
    const type = types[extname(file)] || (path.endsWith('/auth/callback') ? 'text/html' : 'application/octet-stream');
    res.writeHead(200, { 'Content-Type':type, 'Cross-Origin-Opener-Policy':'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy':'credentialless', 'Cache-Control':'no-store' }).end(body);
  } catch { res.writeHead(404).end(); }
});

const postCounts = { private:4, public:336 };
async function seed(tmp) {
  const stores = (await readdir(tmp)).filter(n => n.startsWith('jera-browser-'));
  assert.equal(stores.length, 1, 'Expected exactly one disposable fixture');
  const token = execFileSync(resolve(root, 'node_modules/.bin/snapback4'), ['token','--service','atproto-auth'], {
    cwd:resolve(tmp, stores[0]), encoding:'utf8', stdio:['ignore','pipe','pipe']
  }).trim();
  const service = new JeraClient(storeOrigin, token);
  const {session} = await service.request('/auth/session', {principal:'did:plc:' + 'a'.repeat(24), days:1});
  const owner = new JeraClient(storeOrigin, session.token);
  const audience = (await owner.mutate('ensureAudience', {})).result.id;
  const latest = {};
  // A global first page has no Personal posts in this fixture.
  for (const [mode, count] of Object.entries(postCounts)) {
    for (let i = 0; i < count; i++) {
      const {result} = await owner.mutate('publishPost', {intent:intentId(), body:'Synthetic ' + mode + ' ' + i,
        visibility:mode, audience:mode === 'private' ? audience : null, parent:null});
      latest[mode] = result.id;
    }
  }
  return latest;
}

async function measure(browser, siteOrigin, latest, delayMs) {
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  // Apply transport latency only to the real fixture API. Block external profile/analytics traffic.
  await context.route('https://**/*', route => route.abort());
  await context.route(gatewayOrigin + '/**', async route => {
    if (delayMs && route.request().method() === 'POST') await sleep(delayMs);
    await route.continue();
  });
  try {
    const page = await context.newPage();
    const events = [], started = new Map();
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin === gatewayOrigin && request.method() === 'POST') {
        started.set(request, {endpoint:url.pathname,start:performance.now()});
      }
    });
    page.on('requestfinished', request => {
      if (started.has(request)) events.push({...started.get(request),end:performance.now()});
      started.delete(request);
    });
    await page.goto(siteOrigin);
    await page.getByTestId('handle').fill('owner.test');
    await page.getByTestId('login').click();
    const tab = mode => page.getByTestId('header-experience-' + mode);
    await tab('public').click();
    await page.getByTestId('post-row-' + latest.public).waitFor();
    const samples = [];
    for (let pass = 1; pass <= 2; pass++) {
      for (const [journey, mode] of [['reload','public'],['first-switch','private'],['switch-back','public']]) {
        const start = performance.now();
        if (journey === 'reload') await page.reload({waitUntil:'commit'});
        else await tab(mode).evaluate(el => el.click());
        // Observe the newest root of the requested tab inside the viewport.
        // A spinner or a stale row from the preceding tab cannot end the measurement.
        await page.waitForFunction(id => {
          const rect = document.querySelector('[data-testid="post-row-' + id + '"]')?.getBoundingClientRect();
          return rect && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;
        }, latest[mode], {polling:'raf'});
        const firstRowMs = Math.round(performance.now() - start);
        const requests = events.filter(e => e.start >= start).map(e => ({
          endpoint:e.endpoint, startMs:Math.round(e.start - start), endMs:Math.round(e.end - start)
        }));
        samples.push({pass, delayMs, journey, firstRowMs, requests});
        console.log(JSON.stringify({pass,delayMs,journey,firstRowMs}));
        // Let independent resources finish before the next navigation.
        await page.waitForLoadState('networkidle');
      }
    }
    return samples;
  } finally { await context.close(); }
}

// Never borrow a live preview or modify its store. Check both ports before spawning.
for (const port of [4497,4498]) {
  const probe = createServer().listen(port, '127.0.0.1');
  await once(probe, 'listening');
  await new Promise(resolve => probe.close(resolve));
}
const tmp = await mkdtemp(resolve(tmpdir(), 'jera-feed-measure-'));
const gateway = spawn('node', ['app/test-server.mjs'], {
  cwd:root, env:{...process.env, PORT:'4497', TMPDIR:tmp, JERA_BACKEND_DIR:backendDirectory(), JERA_FIXTURE_DIRECTORY:''},
  stdio:['ignore','ignore','inherit']
});
const stopped = once(gateway, 'exit');
let browser;
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const deadline = Date.now() + 15000;
  while (!await fetch(gatewayOrigin + '/oauth/health').then(r => r.ok).catch(() => false)) {
    if (gateway.exitCode !== null || Date.now() > deadline) throw Error('Disposable gateway did not start');
    await sleep(100);
  }
  const latest = await seed(tmp);
  browser = await chromium.launch({executablePath:browserBinary().executable});
  const samples = [];
  for (const delayMs of [0,50]) {
    samples.push(...await measure(browser, 'http://127.0.0.1:' + server.address().port, latest, delayMs));
  }
  await writeFile(report, JSON.stringify({postCounts, samples}, null, 2) + '\n');
} finally {
  await browser?.close();
  server.closeAllConnections();
  server.close();
  if (gateway.exitCode === null) gateway.kill('SIGTERM');
  await stopped;
  await rmdir(tmp);
}
